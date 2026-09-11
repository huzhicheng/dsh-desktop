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
  /**
   * 打开应用发布页（外部浏览器）。
   *
   * 侧栏「设置」右端那个新版本徽标由壳注入到页面里，点击时经这条通道回到壳。
   * 徽标是注入的普通 DOM，够不到 ipcRenderer，只能走 contextBridge 暴露的方法。
   */
  openReleasePage() {
    ipcRenderer.send('desktop:open-release-page')
  },
  /**
   * 打开当前运行时版本的更新说明（外部浏览器），并消掉左下角那张升级提示卡。
   *
   * 运行时是后台自动升级的，用户没主动做过什么，所以「升了哪一版、都改了什么」
   * 得由壳主动递到眼前。
   */
  openHarnessNotes() {
    ipcRenderer.send('desktop:open-harness-notes')
  },
  /** 用户点「知道了」：只消掉提示卡，不打开任何页面。 */
  dismissHarnessUpgrade() {
    ipcRenderer.send('desktop:dismiss-harness-upgrade')
  },
})
