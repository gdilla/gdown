<template>
  <div class="pref-pane">
    <div class="pref-group">
      <h3 class="pref-group-title">Auto Save</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" checked />
          Enable auto save
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-label">Auto save delay</label>
        <select class="pref-select">
          <option value="1000">1 second</option>
          <option value="3000" selected>3 seconds</option>
          <option value="5000">5 seconds</option>
          <option value="10000">10 seconds</option>
        </select>
      </div>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Markdown</h3>
      <div class="pref-row">
        <label class="pref-label">Markdown flavor</label>
        <select class="pref-select">
          <option value="gfm" selected>GitHub Flavored Markdown</option>
          <option value="commonmark">CommonMark</option>
        </select>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" checked />
          Enable inline math ($...$)
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" checked />
          Enable Mermaid diagrams
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" />
          Strict Markdown mode (no extensions)
        </label>
      </div>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">File Monitoring</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" checked />
          Detect external file changes
        </label>
      </div>
      <div class="pref-row">
        <label class="pref-label">Check interval</label>
        <select class="pref-select">
          <option value="2000">2 seconds</option>
          <option value="5000" selected>5 seconds</option>
          <option value="10000">10 seconds</option>
        </select>
      </div>
    </div>

    <div class="pref-group">
      <h3 class="pref-group-title">Debug</h3>
      <div class="pref-row">
        <label class="pref-checkbox-label">
          <input type="checkbox" class="pref-checkbox" />
          Enable developer tools
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>
