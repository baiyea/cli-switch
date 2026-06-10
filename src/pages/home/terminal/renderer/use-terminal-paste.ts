import type { Terminal } from '@xterm/xterm';
import type { RefObject } from 'react';

import { logBridge } from '../../../../shared/bridge';
import { useSessionStore } from '../../home.store';
import { supportsImagePasteForProvider } from './paste-support.mjs';
import { isWindowsPlatform } from './terminal-platform';
import { fileAttachmentBridge, ptyBridge } from './terminal.bridge';

type PendingWindowsTextPaste = {
  timer: number;
  text: string;
};

type TerminalPasteControllerParams = {
  activeSessionIdRef: RefObject<string | null>;
  pasteInFlightRef: RefObject<Set<string>>;
  nativeImagePasteInFlightRef: RefObject<Set<string>>;
  suppressNextTextPasteUntilRef: RefObject<Map<string, number>>;
  skipWindowsTextPasteUntilRef: RefObject<Map<string, number>>;
  pendingWindowsTextPasteRef: RefObject<Map<string, PendingWindowsTextPaste>>;
};

type InstallPasteHandlersParams = {
  sessionId: string;
  term: Terminal;
  container: HTMLDivElement;
};

function waitForWindowsPasteEvent() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 100);
  });
}

export function createTerminalPasteController({
  activeSessionIdRef,
  pasteInFlightRef,
  nativeImagePasteInFlightRef,
  suppressNextTextPasteUntilRef,
  skipWindowsTextPasteUntilRef,
  pendingWindowsTextPasteRef,
}: TerminalPasteControllerParams) {
  function clearPendingWindowsTextPaste(sessionId: string) {
    const pending = pendingWindowsTextPasteRef.current.get(sessionId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingWindowsTextPasteRef.current.delete(sessionId);
  }

  function scheduleWindowsTextPaste(sessionId: string, text: string) {
    clearPendingWindowsTextPaste(sessionId);
    const timer = window.setTimeout(() => {
      const pending = pendingWindowsTextPasteRef.current.get(sessionId);
      if (!pending || pending.timer !== timer) return;
      pendingWindowsTextPasteRef.current.delete(sessionId);
      ptyBridge.input(sessionId, pending.text);
    }, 250);
    pendingWindowsTextPasteRef.current.set(sessionId, { timer, text });
  }

  async function saveNativeClipboardImage(sessionId: string, cwd: string, source: string) {
    const skipUntil = skipWindowsTextPasteUntilRef.current.get(sessionId) || 0;
    if (
      skipUntil >= Date.now() ||
      pasteInFlightRef.current.has(sessionId) ||
      nativeImagePasteInFlightRef.current.has(sessionId)
    ) {
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: '[key] native image paste skipped: image paste already handling',
        meta: { sessionId, source },
      });
      return true;
    }

    nativeImagePasteInFlightRef.current.add(sessionId);
    try {
      const result = await fileAttachmentBridge.saveAttachmentImage({ cwd, sessionId });
      if (result?.ok && result.relPath) {
        const skipAfterSaveUntil = skipWindowsTextPasteUntilRef.current.get(sessionId) || 0;
        if (skipAfterSaveUntil >= Date.now() || pasteInFlightRef.current.has(sessionId)) {
          logBridge.write({
            level: 'info',
            scope: 'terminal',
            message: '[key] native clipboard image skipped: paste event took precedence',
            meta: { sessionId, source, relPath: result.relPath },
          });
          return true;
        }
        suppressNextTextPasteUntilRef.current.delete(sessionId);
        skipWindowsTextPasteUntilRef.current.set(sessionId, Date.now() + 1500);
        clearPendingWindowsTextPaste(sessionId);
        logBridge.write({
          level: 'info',
          scope: 'terminal',
          message: '[key] native clipboard image pasted',
          meta: { sessionId, source, relPath: result.relPath },
        });
        ptyBridge.input(sessionId, `@${result.relPath}`);
        return true;
      }
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: '[key] no native clipboard image found',
        meta: { sessionId, source, reason: result?.reason },
      });
      return false;
    } catch (error) {
      logBridge.write({
        level: 'warn',
        scope: 'terminal',
        message: '[key] native image paste failed',
        meta: { sessionId, source, error: error instanceof Error ? error.message : String(error) },
      });
      return false;
    } finally {
      nativeImagePasteInFlightRef.current.delete(sessionId);
    }
  }

  function installPasteHandlers({ sessionId, term, container }: InstallPasteHandlersParams) {
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isMod = event.ctrlKey || event.metaKey;

      if (key === 'c' && isMod) {
        if (term.hasSelection()) {
          const selection = term.getSelection();
          logBridge.write({
            level: 'info',
            scope: 'terminal',
            message: '[key] copying selection',
            meta: { sessionId, selectionLength: selection.length },
          });
          void navigator.clipboard
            .writeText(selection)
            .then(() =>
              logBridge.write({
                level: 'info',
                scope: 'terminal',
                message: '[key] copy success',
                meta: { sessionId },
              }),
            )
            .catch((err) =>
              logBridge.write({
                level: 'warn',
                scope: 'terminal',
                message: '[key] copy failed',
                meta: { sessionId, error: err instanceof Error ? err.message : String(err) },
              }),
            );
          term.clearSelection();
          return false;
        }
        logBridge.write({
          level: 'info',
          scope: 'terminal',
          message: '[key] no selection, sending interrupt',
          meta: { sessionId },
        });
        return true;
      }

      if (key === 'v' && isMod) {
        logBridge.write({
          level: 'info',
          scope: 'terminal',
          message: '[key] pasting',
          meta: { sessionId },
        });
        event.preventDefault();

        const session = useSessionStore.getState().sessions.find((s) => s.sessionId === sessionId);
        if (!session || !session.cwd) {
          logBridge.write({
            level: 'info',
            scope: 'terminal',
            message: '[key] paste skipped: no session/cwd',
            meta: { sessionId },
          });
          return false;
        }

        const supportsImagePaste = supportsImagePasteForProvider(
          session.provider,
          navigator.platform,
        );
        const isWindows = isWindowsPlatform();

        if (supportsImagePaste && !isWindows) {
          logBridge.write({
            level: 'info',
            scope: 'terminal',
            message: '[key] trying image paste via IPC',
            meta: { sessionId },
          });
          void fileAttachmentBridge
            .saveAttachmentImage({ cwd: session.cwd, sessionId })
            .then((result) => {
              if (result?.ok && result.relPath) {
                logBridge.write({
                  level: 'info',
                  scope: 'terminal',
                  message: '[key] image pasted',
                  meta: { sessionId, relPath: result.relPath },
                });
                ptyBridge.input(sessionId, `@${result.relPath}`);
                return;
              }
              logBridge.write({
                level: 'info',
                scope: 'terminal',
                message: '[key] no image in clipboard, falling back to text',
                meta: { sessionId, reason: result?.reason },
              });
              navigator.clipboard
                .readText()
                .then((text) => {
                  if (text) ptyBridge.input(sessionId, text);
                })
                .catch(() => {});
            })
            .catch((err) => {
              logBridge.write({
                level: 'warn',
                scope: 'terminal',
                message: '[key] image paste failed',
                meta: { sessionId, error: err instanceof Error ? err.message : String(err) },
              });
              navigator.clipboard
                .readText()
                .then((text) => {
                  if (text) ptyBridge.input(sessionId, text);
                })
                .catch(() => {});
            });
        } else {
          suppressNextTextPasteUntilRef.current.set(sessionId, Date.now() + 1500);
          navigator.clipboard
            .readText()
            .then(async (text) => {
              logBridge.write({
                level: 'info',
                scope: 'terminal',
                message: '[key] text pasted',
                meta: { sessionId, textLength: text?.length ?? 0 },
              });
              if (supportsImagePaste) {
                await waitForWindowsPasteEvent();
                const imagePasted = await saveNativeClipboardImage(
                  sessionId,
                  session.cwd,
                  'windows-key-handler',
                );
                if (imagePasted) return;
              }
              if (!text) return;
              const skipUntil = skipWindowsTextPasteUntilRef.current.get(sessionId) || 0;
              if (skipUntil >= Date.now()) {
                logBridge.write({
                  level: 'info',
                  scope: 'terminal',
                  message: '[key] text paste skipped because image paste took precedence',
                  meta: { sessionId, textLength: text.length },
                });
                return;
              }
              scheduleWindowsTextPaste(sessionId, text);
            })
            .catch(async (err) => {
              logBridge.write({
                level: 'warn',
                scope: 'terminal',
                message: '[key] text paste failed',
                meta: { sessionId, error: err instanceof Error ? err.message : String(err) },
              });
              if (!supportsImagePaste) return;
              await waitForWindowsPasteEvent();
              await saveNativeClipboardImage(sessionId, session.cwd, 'windows-key-handler-error');
            });
        }
        return false;
      }

      return true;
    });

    const onPaste = (event: ClipboardEvent) => {
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: '[paste] event fired',
        meta: {
          sessionId,
          target: (event.target as HTMLElement)?.tagName,
          activeSessionId: activeSessionIdRef.current,
        },
      });

      if (activeSessionIdRef.current !== sessionId) {
        logBridge.write({
          level: 'info',
          scope: 'terminal',
          message: '[paste] skipped: not active session',
          meta: { sessionId, activeSessionId: activeSessionIdRef.current },
        });
        return;
      }
      const session = useSessionStore
        .getState()
        .sessions.find((item) => item.sessionId === sessionId);
      if (!session) {
        logBridge.write({
          level: 'warn',
          scope: 'terminal',
          message: '[paste] skipped: session not found',
          meta: { sessionId },
        });
        return;
      }
      const supportsImagePaste = supportsImagePasteForProvider(
        session.provider,
        navigator.platform,
      );
      if (!supportsImagePaste) {
        logBridge.write({
          level: 'info',
          scope: 'terminal',
          message: '[paste] skipped: provider does not support image paste',
          meta: { sessionId, provider: session.provider },
        });
        return;
      }
      if (!session.cwd) {
        logBridge.write({
          level: 'warn',
          scope: 'terminal',
          message: '[paste] skipped: no cwd',
          meta: { sessionId },
        });
        return;
      }

      const items = Array.from(event.clipboardData?.items || []);
      const types = items.map((i) => i.type);
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: '[paste] clipboard items',
        meta: { sessionId, types },
      });

      const imageItem = items.find((item) =>
        String(item.type || '')
          .toLowerCase()
          .startsWith('image/'),
      );
      if (imageItem) {
        suppressNextTextPasteUntilRef.current.delete(sessionId);
        skipWindowsTextPasteUntilRef.current.set(sessionId, Date.now() + 1500);
        clearPendingWindowsTextPaste(sessionId);
      }

      const suppressUntil = suppressNextTextPasteUntilRef.current.get(sessionId) || 0;
      const shouldSuppressTextPaste = suppressUntil >= Date.now();
      if (!imageItem && shouldSuppressTextPaste) {
        const text = event.clipboardData?.getData('text/plain') || '';
        suppressNextTextPasteUntilRef.current.delete(sessionId);
        if (text) {
          event.preventDefault();
          event.stopPropagation();
          logBridge.write({
            level: 'info',
            scope: 'terminal',
            message: '[paste] text paste suppressed after key handler',
            meta: { sessionId, textLength: text.length, types },
          });
          return;
        }
      }

      if (!imageItem) {
        logBridge.write({
          level: 'info',
          scope: 'terminal',
          message: '[paste] no image item found',
          meta: { sessionId, types },
        });
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: '[paste] image item found, processing',
        meta: { sessionId, mimeType: imageItem.type },
      });

      if (pasteInFlightRef.current.has(sessionId)) {
        logBridge.write({
          level: 'info',
          scope: 'terminal',
          message: '[paste] skipped: already in flight',
          meta: { sessionId },
        });
        return;
      }
      pasteInFlightRef.current.add(sessionId);

      const file = imageItem.getAsFile();
      if (!file) {
        logBridge.write({
          level: 'warn',
          scope: 'terminal',
          message: '[paste] getAsFile returned null',
          meta: { sessionId },
        });
        pasteInFlightRef.current.delete(sessionId);
        return;
      }

      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: '[paste] reading file',
        meta: { sessionId, size: file.size, name: file.name },
      });

      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          logBridge.write({
            level: 'warn',
            scope: 'terminal',
            message: '[paste] empty array buffer',
            meta: { sessionId },
          });
          pasteInFlightRef.current.delete(sessionId);
          return;
        }
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        }
        const base64 = btoa(binary);
        logBridge.write({
          level: 'info',
          scope: 'terminal',
          message: '[paste] base64 ready',
          meta: { sessionId, byteLength: arrayBuffer.byteLength, base64Length: base64.length },
        });

        void fileAttachmentBridge
          .saveAttachmentImageBuffer({
            cwd: session.cwd,
            sessionId,
            base64,
            mimeType: imageItem.type || 'image/png',
          })
          .then((result) => {
            if (!result?.ok || !result.relPath) {
              logBridge.write({
                level: 'warn',
                scope: 'terminal',
                message: '[paste] save failed or skipped',
                meta: { sessionId, reason: result?.reason || 'unknown' },
              });
              return;
            }
            logBridge.write({
              level: 'info',
              scope: 'terminal',
              message: '[paste] image saved',
              meta: { sessionId, relPath: result.relPath },
            });
            ptyBridge.input(sessionId, `@${result.relPath}`);
          })
          .catch((error) => {
            logBridge.write({
              level: 'warn',
              scope: 'terminal',
              message: '[paste] saveAttachmentImageBuffer threw',
              meta: { sessionId, error: error instanceof Error ? error.message : String(error) },
            });
          })
          .finally(() => {
            pasteInFlightRef.current.delete(sessionId);
            try {
              term.focus();
            } catch {}
          });
      };
      reader.onerror = () => {
        logBridge.write({
          level: 'warn',
          scope: 'terminal',
          message: '[paste] FileReader error',
          meta: { sessionId, error: reader.error?.message || 'unknown' },
        });
        pasteInFlightRef.current.delete(sessionId);
      };
      reader.readAsArrayBuffer(file);
    };

    const pasteTarget = term.textarea || container;
    logBridge.write({
      level: 'info',
      scope: 'terminal',
      message: '[paste] binding listener',
      meta: { sessionId, target: (pasteTarget as HTMLElement)?.tagName },
    });
    const pasteListener = (event: Event) => onPaste(event as ClipboardEvent);
    pasteTarget.addEventListener('paste', pasteListener, true);
    return () => {
      logBridge.write({
        level: 'info',
        scope: 'terminal',
        message: '[paste] unbinding listener',
        meta: { sessionId },
      });
      pasteTarget.removeEventListener('paste', pasteListener, true);
    };
  }

  return {
    clearPendingWindowsTextPaste,
    installPasteHandlers,
  };
}

