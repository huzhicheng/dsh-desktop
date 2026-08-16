/**
 * 通道无关的输出管道。
 *
 * agent 的回复是分段产生的，这里把它排成队列，由具体通道决定怎么送出去：
 * 支持编辑消息的通道（飞书卡片、Telegram、Discord）可以边收边刷成打字机效果；
 * 只能整条发的通道攒够再发。核心逻辑不关心是哪种。
 */
export class OutputPipe {
  private readonly queue: string[] = []
  private wake: (() => void) | undefined
  private closed = false
  private failure: string | undefined

  push(text: string): void {
    this.queue.push(text)
    this.wake?.()
  }

  close(failure?: string): void {
    this.closed = true
    this.failure = failure
    this.wake?.()
  }

  /**
   * 持续把队列内容交给 append，直到 close()。
   * @param append - 收到一段新内容时调用；同一次输出里会被多次调用。
   */
  async drainTo(append: (chunk: string) => Promise<void>): Promise<void> {
    let first = true
    for (;;) {
      const chunk = this.queue.shift()
      if (chunk !== undefined) {
        await append(first ? chunk : `\n\n${chunk}`)
        first = false
        continue
      }
      if (this.closed) break
      await new Promise<void>((resolve) => { this.wake = resolve })
      this.wake = undefined
    }
    if (this.failure !== undefined) {
      await append(first ? this.failure : `\n\n${this.failure}`)
    }
  }
}
