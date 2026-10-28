'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { UserError } = require('../../domain/contact.cjs');

const MAX_ENTRIES = 10000;
const MAX_FOLDERS = 1000;

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

async function scanDirectory(selected, io = fs) {
  const rootInfo = await io.lstat(selected);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())
    throw new UserError(
      'Selecciona una carpeta principal real, sin enlaces simbólicos.',
    );
  const root = await io.realpath(selected);
  const folders = [];
  const excluded = [];
  let entryCount = 0;
  const count = () => {
    if (++entryCount > MAX_ENTRIES)
      throw new UserError(
        'La carpeta supera las 10 000 entradas. Divide el contenido y vuelve a revisar.',
      );
  };
  // Stream entries so the limits also bound very large directories.
  const directory = await io.opendir(root);
  for await (const entry of directory) {
    count();
    const folderPath = path.join(root, entry.name);
    const folder = { name: entry.name, files: [], issues: [] };
    let info;
    try {
      info = await io.lstat(folderPath);
    } catch {
      excluded.push({ name: entry.name, reason: 'Entrada inaccesible.' });
      continue;
    }
    if (info.isSymbolicLink() || !info.isDirectory()) {
      excluded.push({
        name: entry.name,
        reason: info.isSymbolicLink()
          ? 'Enlace simbólico excluido.'
          : 'Solo se revisan subcarpetas inmediatas.',
      });
      continue;
    }
    folders.push(folder);
    if (folders.length > MAX_FOLDERS)
      throw new UserError(
        'La carpeta supera las 1 000 subcarpetas. Divide el contenido y vuelve a revisar.',
      );
    try {
      const resolvedFolder = await io.realpath(folderPath);
      if (!isInside(root, resolvedFolder) || resolvedFolder !== folderPath)
        throw new Error('Unsafe folder');
      const children = await io.opendir(folderPath);
      for await (const child of children) {
        count();
        const file = {
          name: child.name,
          size: null,
          readable: false,
          reason: null,
        };
        folder.files.push(file);
        const filePath = path.join(folderPath, child.name);
        let handle;
        try {
          const before = await io.lstat(filePath);
          if (before.isSymbolicLink()) {
            file.reason = 'Enlace simbólico excluido.';
            continue;
          }
          if (!before.isFile()) {
            file.reason = before.isDirectory()
              ? 'Subcarpeta excluida: no se revisa su contenido.'
              : 'Entrada especial excluida.';
            continue;
          }
          if (
            child.name.includes('\\') ||
            [...child.name].some((c) => c.codePointAt(0) < 32)
          ) {
            file.reason =
              'Nombre de archivo no compatible con una revisión segura.';
            continue;
          }
          const resolved = await io.realpath(filePath);
          if (!isInside(root, resolved) || resolved !== filePath)
            throw new Error('Unsafe path');
          await io.access(filePath, constants.R_OK);
          handle = await io.open(
            filePath,
            constants.O_RDONLY |
              (constants.O_NOFOLLOW || 0) |
              (constants.O_NONBLOCK || 0),
          );
          const opened = await handle.stat();
          if (
            !opened.isFile() ||
            opened.dev !== before.dev ||
            opened.ino !== before.ino ||
            (await io.realpath(filePath)) !== filePath ||
            !Number.isSafeInteger(opened.size)
          )
            throw new Error('Changed file');
          file.size = opened.size;
          file.readable = true;
          // These private metadata are not sent to the renderer. Compression must revalidate before reading bytes.
          file.path = filePath;
          file.identity = {
            dev: opened.dev,
            ino: opened.ino,
            size: opened.size,
            mtimeMs: opened.mtimeMs,
          };
        } catch {
          file.reason =
            'Archivo ilegible, modificado durante la revisión o ruta excluida.';
        } finally {
          if (handle) await handle.close();
        }
      }
      if (
        (await io.realpath(folderPath)) !== folderPath ||
        (await io.lstat(folderPath)).isSymbolicLink()
      )
        throw new Error('Folder changed');
    } catch (error) {
      if (error instanceof UserError) throw error;
      folder.files = [];
      folder.issues.push(
        'No se pudo revisar la carpeta de forma segura. Revisa sus permisos y vuelve a analizar.',
      );
    }
    folder.files.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }
  if (
    (await io.realpath(selected)) !== root ||
    (await io.lstat(selected)).isSymbolicLink()
  )
    throw new UserError(
      'La carpeta principal cambió durante la revisión. Vuelve a seleccionarla.',
    );
  folders.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return { root, name: path.basename(root), folders, excluded };
}

module.exports = { scanDirectory, isInside, MAX_ENTRIES, MAX_FOLDERS };
