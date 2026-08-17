/** 状态页 preload：只暴露一个订阅状态更新的只读接口。 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktopStatus', {
  onUpdate(callback: (update: {
    stage: 'preparing' | 'extracting' | 'starting' | 'loading' | 'error'
    message: string
    detail?: string
    error?: string
  }) => void) {
    ipcRenderer.on('status', (_event, update) => { callback(update) })
  },
})
