/**
 * Represents a single node (file or directory) in the file tree.
 * Mirrors the Rust FileNode struct from src-tauri/src/commands/fs.rs.
 */
export interface FileNode {
  /** The display name of the file or directory */
  name: string
  /** The full absolute path */
  path: string
  /** Whether this node is a directory */
  is_dir: boolean
  /** Child nodes (only populated for directories) */
  children?: FileNode[]
}
