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
  /** 扫码创建飞书应用：成功后主进程已落盘，界面重新 load 即可。 */
  registerStart: async () => ipcRenderer.invoke('bridge:register-start'),
  registerCancel: () => { ipcRenderer.send('bridge:register-cancel') },
  /** 用系统默认浏览器打开外链（内置窗口没有用户的登录态）。 */
  openExternal: (url: string) => { ipcRenderer.send('bridge:open-external', url) },
  onRegister: (handler: (event: Record<string, unknown>) => void) => {
    ipcRenderer.on('bridge:register', (_event, payload) => { handler(payload) })
  },
  /** 手填兜底用：可直接粘进开放平台「批量导入权限」的 JSON。 */
  permissionJson: async () => ipcRenderer.invoke('bridge:permission-json'),
})
