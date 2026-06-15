<template>
  <v-dialog v-model="dialogVisible" title="上传文件" width="600px">
    <el-upload
      ref="uploadEle"
      drag
      :auto-upload="false"
      :limit="1"
      accept=".zip"
      :on-change="handleFileChange"
      :on-exceed="handleExceed"
      :file-list="fileList"
    >
      <div>
        <div>
          将文件拖到此处，或<span class="text-primary pl-2 font-bold"
            >点击上传</span
          >
        </div>
        <div class="mt-1 text-xs text-gray-400">仅支持 .zip 文件</div>
      </div>
    </el-upload>
    <el-progress
      v-if="uploadProgress"
      :percentage="uploadProgress"
      :stroke-width="10"
      striped
      striped-flow
      class="mt-4"
    />
    <template #footer>
      <div class="flex items-center justify-center gap-4">
        <el-button @click="handleClose" class="m-0!" type="danger"
          >取消</el-button
        >
        <el-button
          type="primary"
          :loading="uploadFileLoading"
          :disabled="!fileList.length"
          @click="handleUpload"
          class="m-0!"
        >
          开始上传
        </el-button>
      </div>
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, shallowRef, useTemplateRef } from 'vue';
import { ElUpload, ElButton, ElProgress, genFileId } from 'element-plus';
import { loadingFunc, VDialog } from '@repo/ui';
import { api } from '@/api';
import { notify } from '@/plugins/notify';
import { getFileHash } from '@/hooks/file-md5';
import { aiAppEvent } from '../event';

import type { UploadProps, UploadRawFile, UploadUserFile } from 'element-plus';
import type { ApiMain } from '@/types';
import type { AiAppEvent } from '../event';

type AiAppUploadInfo = ApiMain.AiAppUploadInfo;

const dialogVisible = ref(false);
const uploadRef = useTemplateRef('uploadEle');
const fileList = ref<UploadUserFile[]>([]);

const uploadInfo = shallowRef<AiAppEvent['upload']>();

const uploadProgress = ref(0);

const { uploadFile, uploadFileLoading } = loadingFunc({
  funcs: {
    async uploadFile(file: File) {
      const formData = new FormData();

      const info: AiAppUploadInfo = {
        id: uploadInfo.value!.id,
        size: file.size,
        hash: (await getFileHash({ file, method: 'sha256' })).hex,
        name: file.name,
      };

      formData.append('info', JSON.stringify(info));
      formData.append('file', file);

      uploadProgress.value = 0;

      await api('/main/app-upload', formData, {
        onUploadProgress: ({ progress }) => {
          if (progress) {
            uploadProgress.value = Math.floor(progress * 100);
          }
        },
      });

      notify('success', '文件上传成功');

      handleClose();

      await uploadInfo.value!.callback?.();
    },
  },
});

const handleFileChange: UploadProps['onChange'] = (uploadFile, uploadFiles) => {
  fileList.value = uploadFiles;
};

const handleExceed: UploadProps['onExceed'] = (files) => {
  uploadRef.value?.clearFiles();
  const file = files[0] as UploadRawFile;
  file.uid = genFileId();
  uploadRef.value?.handleStart(file);
};

const handleUpload = () => {
  if (fileList.value.length && fileList.value[0]?.raw && uploadInfo.value) {
    uploadFile(fileList.value[0].raw);
  }
};

const handleClose = () => {
  dialogVisible.value = false;
  fileList.value = [];
  uploadRef.value?.clearFiles();
};

aiAppEvent.add('upload', ({ detail }) => {
  uploadInfo.value = detail;
  uploadProgress.value = 0;

  dialogVisible.value = true;
});
</script>
