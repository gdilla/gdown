<template>
  <div class="pref-pane">
    <!-- Image Save Behavior -->
    <div class="pref-group">
      <h3 class="pref-group-title">When Insert Images...</h3>
      <div class="pref-row">
        <label class="pref-label">Image save behavior</label>
        <select
          class="pref-select"
          :value="store.settings.saveBehavior"
          @change="store.update('saveBehavior', ($event.target as HTMLSelectElement).value as any)"
        >
          <option value="copy-to-assets">Copy image to assets folder</option>
          <option value="move-to-assets">Move image to assets folder</option>
          <option value="keep-in-place">Keep image in original location</option>
        </select>
      </div>
      <p class="pref-hint">
        Controls what happens to images when they are inserted via drag-and-drop, paste, or the insert image dialog.
      </p>
    </div>

    <!-- Assets Folder -->
    <div class="pref-group">
      <h3 class="pref-group-title">Assets Folder</h3>
      <div class="pref-row">
        <label class="pref-label">Folder name</label>
        <input
          type="text"
          class="pref-input"
          :value="store.settings.assetsFolderName"
          placeholder="assets"
          @input="store.update('assetsFolderName', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <p class="pref-hint">
        Name of the folder (relative to the document) where images are stored.
        Default: <code>assets</code>
      </p>
    </div>

    <!-- Path Settings -->
    <div class="pref-group">
      <h3 class="pref-group-title">Image Path</h3>
      <div class="pref-row">
        <label class="pref-label">Path type in markdown</label>
        <select
          class="pref-select"
          :value="store.settings.pathType"
          @change="store.update('pathType', ($event.target as HTMLSelectElement).value as any)"
        >
          <option value="relative">Relative path (e.g., ./assets/image.png)</option>
          <option value="absolute">Absolute path (e.g., /Users/.../image.png)</option>
        </select>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            :checked="store.settings.preferRelativePath"
            @change="store.update('preferRelativePath', ($event.target as HTMLInputElement).checked)"
          />
          Prefer relative paths from document directory
        </label>
      </div>
      <p class="pref-hint">
        Relative paths make documents more portable across machines.
        Absolute paths are useful when images are stored in a fixed location.
      </p>
    </div>

    <!-- Copy Behavior -->
    <div class="pref-group">
      <h3 class="pref-group-title">Copy Behavior</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input
            type="checkbox"
            class="pref-checkbox"
            :checked="store.settings.autoRenameOnConflict"
            @change="store.update('autoRenameOnConflict', ($event.target as HTMLInputElement).checked)"
          />
          Auto-rename images on filename conflict
        </label>
      </div>
      <p class="pref-hint">
        When enabled, if an image with the same name already exists in the assets folder,
        a suffix (e.g., <code>image_1.png</code>) is automatically added.
      </p>
    </div>

    <!-- Upload Service (placeholder for v1) -->
    <div class="pref-group">
      <h3 class="pref-group-title">Image Upload Service</h3>
      <div class="pref-row">
        <label class="pref-label">Upload service</label>
        <select
          class="pref-select"
          :value="store.settings.uploadService"
          @change="store.update('uploadService', ($event.target as HTMLSelectElement).value as any)"
        >
          <option value="none">None (local storage only)</option>
          <option value="custom" disabled>Custom URL (coming soon)</option>
        </select>
      </div>
      <div v-if="store.settings.uploadService === 'custom'" class="pref-row">
        <label class="pref-label">Custom upload URL</label>
        <input
          type="url"
          class="pref-input"
          :value="store.settings.customUploadUrl"
          placeholder="https://example.com/upload"
          @input="store.update('customUploadUrl', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <p class="pref-hint">
        Image upload is not available in v1. Images are stored locally only.
      </p>
    </div>

    <!-- Reset -->
    <div class="pref-group pref-group-actions">
      <button class="pref-btn pref-btn-secondary" @click="store.reset()">
        Reset to Defaults
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useImageSettingsStore } from '../../stores/imageSettings'

const store = useImageSettingsStore()
</script>
