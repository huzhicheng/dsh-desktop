/**
 * 背景图库：用过的背景都留在这儿，随时能挑回来。
 *
 * 原本这里只存视频（图片压成 data URI 塞进 localStorage 就够用了），但那样有两个
 * 问题：一是换一张，上一张就永久没了，用户没法回到之前那张；二是图只活在「当前
 * 配置」里，面板一关没保存就等于没加过。
 *
 * 现在改成选中即入库。入库和「保存皮肤」是两件事——入库立即落盘，保存只决定当前
 * 用哪一张。所以试了半天没点保存，图也还在，下次打开还能挑。
 *
 * 存 IndexedDB 而不是 localStorage：后者约 5MB 配额，存不下几张图，更存不下视频。
 * 皮肤配置本身仍只记一个 id 或一段压缩后的 data URI，保持「一份配置描述一套外观」。
 */

const DB_NAME = 'dsh-skin-studio'
const DB_VERSION = 1
const STORE = 'background'

/**
 * 图库上限。
 *
 * 不设上限的话，用户随手试十几张 4K 图就能占掉几百兆，而这些占用在浏览器存储里，
 * 他既看不见也不知道去哪清。超出后淘汰最旧的（当前选中的那张永远保留）。
 */
const MAX_ENTRIES = 24

export interface LibraryEntry {
  id: string
  kind: 'image' | 'video'
  /** 原始文件名，界面回显用。 */
  name: string
  /** 入库时间戳，用来排序与淘汰。 */
  addedAt: number
  /** 网格缩略图，data URI；图片和视频都有。 */
  thumb: string
  /** kind 为 image 时的压缩后 data URI，运行时直接拿去当背景。 */
  uri?: string
  /** kind 为 video 时的视频本体。 */
  blob?: Blob
}

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

/**
 * 把库里存的值归一成 LibraryEntry。
 *
 * 老版本直接把 Blob 当值存（那时只有视频、也没有图库），升级后这些记录仍要能认出来，
 * 否则用户之前设的视频背景会在升级后凭空消失。
 */
function toEntry(id: string, value: unknown): LibraryEntry | undefined {
  if (value instanceof Blob) {
    return { id, kind: 'video', name: '背景视频', addedAt: 0, thumb: '', blob: value }
  }
  if (typeof value !== 'object' || value === null) return undefined
  const raw = value as Partial<LibraryEntry>
  if (raw.kind !== 'image' && raw.kind !== 'video') return undefined
  return {
    id,
    kind: raw.kind,
    name: typeof raw.name === 'string' ? raw.name : '',
    addedAt: typeof raw.addedAt === 'number' ? raw.addedAt : 0,
    thumb: typeof raw.thumb === 'string' ? raw.thumb : '',
    uri: typeof raw.uri === 'string' ? raw.uri : undefined,
    blob: raw.blob instanceof Blob ? raw.blob : undefined,
  }
}

/** 存入一条背景，键为调用方生成的 id。 */
export async function putEntry(entry: LibraryEntry): Promise<void> {
  await withStore('readwrite', store => store.put(entry, entry.id))
}

/** 取一条背景；不存在（换了浏览器、清过站点数据）时返回 undefined。 */
export async function getEntry(id: string): Promise<LibraryEntry | undefined> {
  if (id === '') return undefined
  const value = await withStore<unknown>('readonly', store => store.get(id))
  return value === undefined ? undefined : toEntry(id, value)
}

/** 列出全部背景，新加的排前面。 */
export async function listEntries(): Promise<LibraryEntry[]> {
  const keys = await withStore<IDBValidKey[]>('readonly', store => store.getAllKeys())
  const values = await withStore<unknown[]>('readonly', store => store.getAll())
  const entries: LibraryEntry[] = []
  for (const [index, key] of keys.entries()) {
    const entry = toEntry(String(key), values[index])
    if (entry !== undefined) entries.push(entry)
  }
  return entries.sort((a, b) => b.addedAt - a.addedAt)
}

/** 删掉一条背景。 */
export async function deleteEntry(id: string): Promise<void> {
  await withStore('readwrite', store => store.delete(id))
}

/**
 * 把图库压回上限以内，淘汰最旧的。
 * @param keepId - 当前选中的那条，无论多旧都不删。
 */
export async function trimLibrary(keepId: string): Promise<void> {
  const entries = await listEntries()
  if (entries.length <= MAX_ENTRIES) return
  for (const entry of entries.slice(MAX_ENTRIES)) {
    if (entry.id === keepId) continue
    await deleteEntry(entry.id)
  }
}

/**
 * 取一段视频的本体，供运行时播放。
 *
 * 独立于 getEntry 是因为运行时只关心 Blob，不该被图库的数据形状绑住。
 */
export async function getVideo(id: string): Promise<Blob | undefined> {
  return (await getEntry(id))?.blob
}
