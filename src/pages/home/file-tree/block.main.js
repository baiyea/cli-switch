function registerFileTreeMain(context = {}) {
  const {
    registerIpc,
    IPC,
    path,
    fs,
    Buffer,
    shell,
    clipboard,
    nativeImage,
    fileTreeSchema,
    fileOpenPathSchema,
    fileAttachmentSaveSchema,
    fileAttachmentSaveBufferSchema,
    buildFileTree,
    ensureDirSafe,
    logInfo = () => {},
    logWarn = () => {}
  } = context;

  if (!registerIpc || !IPC) return;

  registerIpc(IPC.FILE_TREE_READ, async (_event, payload) => {
    const parsed = fileTreeSchema.parse(payload);
    const root = path.resolve(parsed.cwd);
    const tree = buildFileTree(root, parsed.depth);
    return { cwd: root, isGitRepo: tree.isGitRepo, items: tree.items };
  });

  registerIpc(IPC.FILE_OPEN_PATH, async (_event, payload) => {
    const parsed = fileOpenPathSchema.parse(payload);
    const target = path.resolve(parsed.path);
    logInfo("files", "Opening path", { target });
    const errorMessage = await shell.openPath(target);
    if (errorMessage) {
      logWarn("files", "Open path failed", { target, errorMessage });
      throw new Error(errorMessage);
    }
    return { ok: true };
  });

  registerIpc(IPC.FILE_ATTACHMENT_SAVE, async (_event, payload) => {
    const parsed = fileAttachmentSaveSchema.parse(payload || {});
    const root = path.resolve(parsed.cwd);

    let image = clipboard.readImage();
    let bytes = null;
    let mimeType = "image/png";
    let ext = "png";

    if (image && !image.isEmpty()) bytes = image.toPNG();

    if (!bytes || bytes.length === 0) {
      const formats = clipboard.availableFormats();
      logInfo("files", "Clipboard formats", { sessionId: parsed.sessionId, formats });

      const formatMap = [
        { fmt: "PNG", mime: "image/png", ext: "png" },
        { fmt: "image/png", mime: "image/png", ext: "png" },
        { fmt: "JFIF", mime: "image/jpeg", ext: "jpg" },
        { fmt: "image/jpeg", mime: "image/jpeg", ext: "jpg" },
        { fmt: "GIF", mime: "image/gif", ext: "gif" },
        { fmt: "image/gif", mime: "image/gif", ext: "gif" },
        { fmt: "WEBP", mime: "image/webp", ext: "webp" },
        { fmt: "image/webp", mime: "image/webp", ext: "webp" }
      ];

      for (const candidate of formatMap) {
        if (!formats.includes(candidate.fmt)) continue;
        try {
          bytes = clipboard.readBuffer(candidate.fmt);
          if (bytes && bytes.length > 0) {
            mimeType = candidate.mime;
            ext = candidate.ext;
            logInfo("files", "Read clipboard image via readBuffer", {
              sessionId: parsed.sessionId,
              format: candidate.fmt,
              size: bytes.length
            });
            break;
          }
        } catch (err) {
          logWarn("files", "readBuffer failed", { format: candidate.fmt, error: err.message });
        }
      }

      if (!bytes || bytes.length === 0) {
        const dibFormat = formats.find((f) => /dib|bitmap/i.test(f));
        if (dibFormat) {
          try {
            const dib = clipboard.readBuffer(dibFormat);
            if (dib && dib.length > 0) {
              image = nativeImage.createFromBuffer(dib, { width: 1, height: 1 });
              if (image && !image.isEmpty()) {
                bytes = image.toPNG();
                mimeType = "image/png";
                ext = "png";
                logInfo("files", "Converted DIB to PNG via nativeImage", {
                  sessionId: parsed.sessionId,
                  format: dibFormat,
                  size: bytes.length
                });
              }
            }
          } catch (err) {
            logWarn("files", "DIB conversion failed", { format: dibFormat, error: err.message });
          }
        }
      }
    }

    if (!bytes || bytes.length === 0) return { ok: false, reason: "no-image" };

    const dir = path.join(root, ".claude", "attachments");
    ensureDirSafe(dir);
    const micros = (BigInt(Date.now()) * 1000n + (process.hrtime.bigint() % 1000n)).toString();
    const fileName = `${micros}.${ext}`;
    const absPath = path.join(dir, fileName);
    fs.writeFileSync(absPath, bytes);

    const relPath = `.claude/attachments/${fileName}`;
    logInfo("files", "Saved clipboard image attachment", {
      sessionId: parsed.sessionId,
      cwd: root,
      relPath,
      mimeType,
      size: bytes.length
    });
    return { ok: true, absPath, relPath, mimeType };
  });

  registerIpc(IPC.FILE_ATTACHMENT_SAVE_BUFFER, async (_event, payload) => {
    const parsed = fileAttachmentSaveBufferSchema.parse(payload || {});
    const root = path.resolve(parsed.cwd);
    const bytes = Buffer.from(parsed.base64, "base64");
    if (!bytes || bytes.length === 0) return { ok: false, reason: "empty-image" };

    const mimeToExt = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp"
    };
    const ext = mimeToExt[parsed.mimeType.toLowerCase()] || "png";

    const dir = path.join(root, ".claude", "attachments");
    ensureDirSafe(dir);
    const micros = (BigInt(Date.now()) * 1000n + (process.hrtime.bigint() % 1000n)).toString();
    const fileName = `${micros}.${ext}`;
    const absPath = path.join(dir, fileName);
    fs.writeFileSync(absPath, bytes);

    const relPath = `.claude/attachments/${fileName}`;
    logInfo("files", "Saved clipboard image attachment (buffer)", {
      sessionId: parsed.sessionId,
      cwd: root,
      relPath,
      mimeType: parsed.mimeType,
      size: bytes.length
    });
    return { ok: true, absPath, relPath, mimeType: parsed.mimeType };
  });
}

module.exports = { registerFileTreeMain };
