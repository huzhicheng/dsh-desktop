/**
 * 背景视频的本地存放。
 *
 * 图片转成 data URI 塞进 localStorage 就够用，视频不行：localStorage 只有约 5MB
 * 配额，而一段能当背景的 mp4 动辄几十 MB。IndexedDB 能直接存 Blob，配额按磁盘
 * 剩余空间给（通常是 GB 级），也不必把二进制转成 base64 再撑大三分之一。
 *
 * 配置里只留一个 id，视频本体存在这里。皮肤配置的定位是「一份配置完整描述一套
 * 外观、可复制可分享」，往里塞几十 MB 二进制就不成立了。
 */

const DB_NAME = 'dsh-skin-studio'
const DB_VERSION = 1
const STORE = 'background'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (): void => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
    }
    request.onsuccess = (): void => { resolve(request.result) }
    request.onerror = (): void => { reject(request.error ?? new Error('无法打开本地数据库')) }
  })
}

async function withStore<T>(
  mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = (): void => { resolve(request.result) }
      request.onerror = (): void => { reject(request.error ?? new Error('本地数据库读写失败')) }
    })
  } finally {
    db.close()
  }
}

/** 存入一段视频，键为调用方生成的 id。 */
export async function putVideo(id: string, blob: Blob): Promise<void> {
  await withStore('readwrite', store => store.put(blob, id))
}

/** 取出视频；不存在（换了浏览器、清过站点数据）时返回 undefined。 */
export async function getVideo(id: string): Promise<Blob | undefined> {
  const value = await withStore<unknown>('readonly', store => store.get(id))
  return value instanceof Blob ? value : undefined
}

/**
 * 删掉除 keepId 之外的所有视频。
 *
 * 一次只用一段背景，换了新的之后旧的就是纯占磁盘——而且占的是用户看不见、
 * 也不知道该去哪清的地方，必须自己收拾干净。传空串表示全删。
 */
export async function pruneVideos(keepId: string): Promise<void> {
  const keys = await withStore<IDBValidKey[]>('readonly', store => store.getAllKeys())
  for (const key of keys) {
    if (String(key) === keepId) continue
    await withStore('readwrite', store => store.delete(key))
  }
}
