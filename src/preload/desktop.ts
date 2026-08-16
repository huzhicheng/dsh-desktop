/**
 * 注入进 Harness 页面的极窄桌面能力通道。
 *
 * 侧栏「远程控制」入口由 dsh 插件提供，运行在浏览器里，够不到壳的进程与窗口；
 * 这里只暴露一个打开方法，别的什么都不给。插件检测不到这个对象时会自动隐藏
 * 该入口，所以同一个插件在纯浏览器下也能正常工作。
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshDesktop', {
  /** 标记当前运行在桌面壳内，插件据此决定是否显示桌面专属入口。 */
  isDesktop: true,
  /** 打开远程控制（飞书桥接）设置窗口。 */
  openRemoteControl() {
    ipcRenderer.send('desktop:open-remote-control')
  },
})
