<template>
  <section class="flex min-h-full flex-col rounded bg-white p-4 shadow">
    <el-tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col">
      <el-tab-pane label="通用文件" name="files" lazy>
        <file-list-panel v-if="activeTab === 'files'" />
      </el-tab-pane>
      <el-tab-pane label="上传会话" name="sessions" lazy>
        <upload-session-panel v-if="activeTab === 'sessions'" />
      </el-tab-pane>
    </el-tabs>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElTabPane, ElTabs } from 'element-plus';

import FileListPanel from './components/FileListPanel.vue';
import UploadSessionPanel from './components/UploadSessionPanel.vue';

const activeTab = ref('files');
</script>
