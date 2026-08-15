/** 桥接设置页的受限桥接层：只暴露读写配置、选目录、看状态。 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('bridgeSettings', {
  load: async () => ipcRenderer.invoke('bridge:get-config'),
  save: async (config: unknown) => ipcRenderer.invoke('bridge:save-config', config),
  pickDirectory: async () => ipcRenderer.invoke('bridge:pick-directory'),
  status: async () => ipcRenderer.invoke('bridge:get-status'),
  onStatus: (handler: (status: { state: string; message?: string }) => void) => {
    ipcRenderer.on('bridge:status', (_event, status) => { handler(status) })
  },
})
