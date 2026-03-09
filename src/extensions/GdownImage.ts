import Image from "@tiptap/extension-image";
import { markdownImageInputRule } from "./MarkdownImageInputRule";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { invoke } from "@tauri-apps/api/core";

/**
 * Get the file path of the currently active document from the tabs store.
 * Uses dynamic import to avoid circular dependencies.
 */
async function getActiveDocumentPath(): Promise<string | null> {
  try {
    const { useTabsStore } = await import("../stores/tabs");
    const tabsStore = useTabsStore();
    return tabsStore.activeTab?.filePath ?? null;
  } catch {
    return null;
  }
}

/**
 * Copy a dropped/pasted image file to the assets folder relative to the current document.
 * Returns the relative path to the copied image, or null if the operation fails.
 *
 * Falls back to base64 data URL if:
 * - The current document hasn't been saved to disk yet (no filePath)
 * - The Tauri backend copy command fails
 */
async function copyImageToAssets(
  file: File
): Promise<{ src: string; isRelative: boolean }> {
  const documentPath = await getActiveDocumentPath();

  // If the document hasn't been saved yet, we can't create a relative assets path.
  // Check if we have a native file path from drag-and-drop (webkitRelativePath or path property).
  if (!documentPath) {
    // Fallback: use base64 data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({ src: e.target?.result as string, isRelative: false });
      };
      reader.onerror = () => {
        resolve({ src: "", isRelative: false });
      };
      reader.readAsDataURL(file);
    });
  }

  // For dropped files, the browser provides the file object but not the native path.
  // We need to read the file as bytes, write it to assets ourselves via Tauri.
  // However, the `copy_image_to_assets` command expects a source path on disk.
  //
  // Strategy: For drag-and-drop from Finder on macOS, the file object has a `.path`
  // property (non-standard, available in Tauri/Electron). If not available,
  // we write the file bytes to a temp location first, then copy to assets.
  const nativePath = (file as any).path as string | undefined;

  if (nativePath) {
    try {
      const relativePath = await invoke<string>("copy_image_to_assets", {
        imagePath: nativePath,
        documentPath,
      });
      return { src: relativePath, isRelative: true };
    } catch (err) {
      console.warn("Failed to copy image to assets via native path:", err);
    }
  }

  // Fallback: Read file as raw bytes and write to assets via write_image_to_assets command
  try {
    const arrayBuffer = await file.arrayBuffer();
    const imageBytes = Array.from(new Uint8Array(arrayBuffer));
    const relativePath = await invoke<string>("write_image_to_assets", {
      imageBytes,
      fileName: file.name,
      documentPath,
    });
    return { src: relativePath, isRelative: true };
  } catch {
    // Final fallback: base64 data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({ src: e.target?.result as string, isRelative: false });
      };
      reader.onerror = () => {
        resolve({ src: "", isRelative: false });
      };
      reader.readAsDataURL(file);
    });
  }
}

/**
 * GdownImage: Custom TipTap Image extension with Typora-like behavior.
 *
 * Features:
 * - Markdown input rule: ![alt](src) converts to inline image preview
 * - Inline preview rendering with loading/error states
 * - Click to select, showing resize handles (future)
 * - Alt text shown as caption below image
 * - Drag and drop support — copies images to ./assets folder relative to document
 * - Paste support — copies pasted images to ./assets folder
 * - Local file path support for images
 */
export const GdownImage = Image.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      inline: true,
      allowBase64: true,
      resize: false as const,
      HTMLAttributes: {
        class: "gdown-image",
        loading: "lazy",
      },
    };
  },

  // Override to be inline like Typora
  inline: true,
  group: "inline",
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("src"),
      },
      alt: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("alt"),
      },
      title: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("title"),
      },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("width"),
      },
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("height"),
      },
      loading: {
        default: "lazy",
      },
    };
  },

  addInputRules() {
    return [markdownImageInputRule(this.type)];
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-i": () => {
        // Typora shortcut: Cmd+Shift+I to insert image
        window.dispatchEvent(new CustomEvent("gdown:insert-image"));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const plugins = this.parent?.() || [];

    // Plugin for image loading states and click handling
    plugins.push(
      new Plugin({
        key: new PluginKey("gdownImageHandler"),
        props: {
          handleDOMEvents: {
            // Handle Cmd+click on images to show image info
            click: (_view, event) => {
              const target = event.target as HTMLElement;
              if (target.tagName === "IMG" && target.classList.contains("gdown-image")) {
                if (event.metaKey || event.ctrlKey) {
                  // Cmd+click: open image in external viewer/browser
                  const src = target.getAttribute("src");
                  if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
                    window.open(src, "_blank");
                  }
                  event.preventDefault();
                  return true;
                }
              }
              return false;
            },
          },
        },
      })
    );

    // Plugin for drag-and-drop and paste image insertion
    // Copies images to ./assets folder relative to current document
    plugins.push(
      new Plugin({
        key: new PluginKey("gdownImageDrop"),
        props: {
          handleDrop: (view, event) => {
            const files = event.dataTransfer?.files;
            if (!files || files.length === 0) return false;

            const images = Array.from(files).filter((file) =>
              file.type.startsWith("image/")
            );
            if (images.length === 0) return false;

            event.preventDefault();
            const pos = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (!pos) return false;

            // Process each dropped image asynchronously
            images.forEach((imageFile) => {
              copyImageToAssets(imageFile).then(({ src }) => {
                if (!src) return;
                const node = view.state.schema.nodes.image!.create({
                  src,
                  alt: imageFile.name.replace(/\.[^/.]+$/, ""), // Strip extension for alt text
                });
                const tr = view.state.tr.insert(pos.pos, node);
                view.dispatch(tr);
              }).catch((err) => {
                console.error("Failed to process dropped image:", err);
                // Fallback: insert with base64 data URL
                const reader = new FileReader();
                reader.onload = (readerEvent) => {
                  const fallbackSrc = readerEvent.target?.result as string;
                  const node = view.state.schema.nodes.image!.create({
                    src: fallbackSrc,
                    alt: imageFile.name,
                  });
                  const tr = view.state.tr.insert(pos.pos, node);
                  view.dispatch(tr);
                };
                reader.readAsDataURL(imageFile);
              });
            });
            return true;
          },
          handlePaste: (view, event) => {
            const items = event.clipboardData?.items;
            if (!items) return false;

            const images = Array.from(items).filter((item) =>
              item.type.startsWith("image/")
            );
            if (images.length === 0) return false;

            event.preventDefault();
            images.forEach((item) => {
              const file = item.getAsFile();
              if (!file) return;

              // Generate a reasonable filename for pasted images (they often lack names)
              const pasteFileName = file.name && file.name !== "image.png"
                ? file.name
                : `pasted-image-${Date.now()}.${file.type.split("/")[1] || "png"}`;

              // Create a new File with the generated name if needed
              const namedFile = new File([file], pasteFileName, { type: file.type });

              copyImageToAssets(namedFile).then(({ src }) => {
                if (!src) return;
                const node = view.state.schema.nodes.image!.create({
                  src,
                  alt: pasteFileName.replace(/\.[^/.]+$/, ""),
                });
                const tr = view.state.tr.replaceSelectionWith(node);
                view.dispatch(tr);
              }).catch((err) => {
                console.error("Failed to process pasted image:", err);
                // Fallback: insert with base64 data URL
                const reader = new FileReader();
                reader.onload = (readerEvent) => {
                  const fallbackSrc = readerEvent.target?.result as string;
                  const node = view.state.schema.nodes.image!.create({
                    src: fallbackSrc,
                    alt: file.name,
                  });
                  const tr = view.state.tr.replaceSelectionWith(node);
                  view.dispatch(tr);
                };
                reader.readAsDataURL(file);
              });
            });
            return true;
          },
        },
      })
    );

    return plugins;
  },
});
