import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { InputRule } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

/**
 * GdownTaskItem: Custom TipTap Task Item extension with Typora-like behavior.
 *
 * Features:
 * - Checkbox rendering with clickable toggle
 * - Tab/Shift+Tab for nesting
 * - Preserves checked state across edits
 * - Backspace on empty task item converts back to paragraph
 */
export const GdownTaskItem = TaskItem.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: "gdown-task-item",
      },
      nested: true,
      taskListTypeName: "taskList",
    };
  },

  addKeyboardShortcuts() {
    return {
      // Tab indents task item
      Tab: () => {
        if (this.editor.isActive("taskItem")) {
          return this.editor.chain().focus().sinkListItem("taskItem").run();
        }
        return false;
      },

      // Shift+Tab outdents task item
      "Shift-Tab": () => {
        if (this.editor.isActive("taskItem")) {
          return this.editor.chain().focus().liftListItem("taskItem").run();
        }
        return false;
      },

      // Enter on empty task item exits the task list
      Enter: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        if (!selection.empty) return false;
        if (!this.editor.isActive("taskItem")) return false;

        // Only handle empty content in task items
        // Task items contain a paragraph as child; check if that paragraph is empty
        if ($from.parent.content.size !== 0) return false;

        // Check nesting depth
        let taskListDepth = 0;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === "taskList") {
            taskListDepth++;
          }
        }

        if (taskListDepth > 1) {
          return this.editor
            .chain()
            .focus()
            .liftListItem("taskItem")
            .run();
        }

        // Exit the task list
        return this.editor.chain().focus().liftListItem("taskItem").run();
      },

      // Backspace at start of task item
      Backspace: () => {
        const { state } = this.editor;
        const { selection } = state;
        const { $from } = selection;

        if (!selection.empty || $from.parentOffset !== 0) return false;
        if (!this.editor.isActive("taskItem")) return false;

        return this.editor.chain().focus().liftListItem("taskItem").run();
      },
    };
  },
});

/**
 * GdownTaskList: Custom TipTap Task List extension with Typora-like behavior.
 *
 * Features:
 * - Markdown input rules: "- [ ] " and "- [x] " at start of line
 * - Also supports "* [ ] " and "+ [ ] " variants
 * - Renders as checkboxes that can be toggled by clicking
 * - Keyboard shortcut: Cmd+Shift+X (Typora shortcut for task list)
 * - Nested task lists supported
 */
export const GdownTaskList = TaskList.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      HTMLAttributes: {
        class: "gdown-task-list",
      },
      itemTypeName: "taskItem",
    };
  },

  addInputRules() {
    const taskListType = this.type;

    const createTaskListTransaction = (
      state: EditorState,
      start: number,
      end: number,
      checked: boolean
    ) => {
      const { tr, schema } = state;
      const $start = state.doc.resolve(start);

      // Only match at start of block
      if ($start.parentOffset !== 0) {
        return null;
      }

      // Delete the input rule text
      tr.delete(start, end);

      // Get the task list and task item types
      const taskItemType = schema.nodes.taskItem;

      if (!taskItemType) {
        return null;
      }

      // Wrap in task list > task item
      const blockStart = $start.before($start.depth);
      const blockEnd = $start.after($start.depth);

      const mappedStart = tr.mapping.map(blockStart);
      const mappedEnd = tr.mapping.map(blockEnd);
      const $mappedFrom = tr.doc.resolve(mappedStart);
      const $mappedTo = tr.doc.resolve(mappedEnd);
      const range = $mappedFrom.blockRange($mappedTo);
      if (!range) return null;

      try {
        tr.wrap(range, [
          { type: taskListType },
          { type: taskItemType, attrs: { checked } },
        ]);
      } catch {
        // If wrapping fails, return null to let the default behavior handle it
        return null;
      }

      return tr;
    };

    return [
      // "- [ ] " unchecked task (dash)
      new InputRule({
        find: /^\s*[-]\s\[\s?\]\s$/,
        handler: ({ state, range }) => {
          createTaskListTransaction(state, range.from, range.to, false);
        },
      }),
      // "- [x] " or "- [X] " checked task (dash)
      new InputRule({
        find: /^\s*[-]\s\[[xX]\]\s$/,
        handler: ({ state, range }) => {
          createTaskListTransaction(state, range.from, range.to, true);
        },
      }),
      // "* [ ] " unchecked task (asterisk)
      new InputRule({
        find: /^\s*[*]\s\[\s?\]\s$/,
        handler: ({ state, range }) => {
          createTaskListTransaction(state, range.from, range.to, false);
        },
      }),
      // "* [x] " or "* [X] " checked task (asterisk)
      new InputRule({
        find: /^\s*[*]\s\[[xX]\]\s$/,
        handler: ({ state, range }) => {
          createTaskListTransaction(state, range.from, range.to, true);
        },
      }),
      // "+ [ ] " unchecked task (plus)
      new InputRule({
        find: /^\s*[+]\s\[\s?\]\s$/,
        handler: ({ state, range }) => {
          createTaskListTransaction(state, range.from, range.to, false);
        },
      }),
      // "+ [x] " or "+ [X] " checked task (plus)
      new InputRule({
        find: /^\s*[+]\s\[[xX]\]\s$/,
        handler: ({ state, range }) => {
          createTaskListTransaction(state, range.from, range.to, true);
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      // Typora shortcut: Cmd+Shift+X for task list
      "Mod-Shift-x": () => {
        return this.editor.chain().focus().toggleTaskList().run();
      },
    };
  },
});
