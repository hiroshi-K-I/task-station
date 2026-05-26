# Task Station — システム仕様書

> Version: 2026-05-26  
> ブランチ: `claude/task-management-design-vzGqG`  
> 構成: `index.html` 単一ファイル (HTML + CSS + JavaScript)

---

## 目次

1. [コンセプト・設計方針](#1-コンセプト設計方針)
2. [アーキテクチャ概観](#2-アーキテクチャ概観)
3. [データモデル](#3-データモデル)
4. [永続化・ストレージ](#4-永続化ストレージ)
5. [画面構成・UI コンポーネント](#5-画面構成ui-コンポーネント)
6. [機能仕様](#6-機能仕様)
7. [キーボードショートカット](#7-キーボードショートカット)
8. [クラス設計・API](#8-クラス設計api)
9. [セキュリティ](#9-セキュリティ)
10. [デザインシステム](#10-デザインシステム)
11. [既知の制約・仕様上の限界](#11-既知の制約仕様上の限界)

---

## 1. コンセプト・設計方針

### プロダクト概要

Task Station は **完全ローカル動作** のタスク管理ツール。外部サーバー・API・CDN への通信は一切行わない。`index.html` 1 ファイルで完結する。

### 設計原則

| 原則 | 実装方針 |
|------|---------|
| **ローカルファースト** | IndexedDB のみ。外部通信ゼロ |
| **キーボードファースト** | 全操作にショートカットあり |
| **シングルファイル** | HTML/CSS/JS を 1 ファイルにインライン |
| **依存ゼロ** | フレームワーク・ライブラリ不使用 |
| **ミニマル UI** | GitHub の OSS ページに近いトーン |

---

## 2. アーキテクチャ概観

```
index.html
│
├── <style>           CSS カスタムプロパティ + GitHub 風デザイン
│
└── <script>
    ├── TaskDB          IndexedDB ラッパー (Promise ベース)
    ├── Store           状態管理 + pub/sub イベントバス + Undo 履歴
    ├── BoardView       カンバンビューのレンダリング
    ├── CalendarView    カレンダービュー + 完了実績グラフ
    ├── Modal           タスク作成・編集モーダル
    ├── QuickCapture    ショートカットキャプチャバー
    ├── CommandPalette  インクリメンタルサーチ
    ├── DragManager     HTML5 D&D ハンドラ
    └── KeyboardManager グローバルキーバインド
```

### 状態フロー

```
ユーザー操作
    │
    ▼
Store メソッド (createTask / moveTask / ...)
    │ emit('changed')
    ▼
BoardView.render() or CalendarView.render()
    │
    ▼
DOM 再構築 (container.innerHTML = '' → appendChild)
```

### イベント一覧

| イベント名 | 発火タイミング | リスナー |
|-----------|--------------|---------|
| `loaded` | DB 読み込み完了 | 初期描画 |
| `changed` | 任意の状態変更後 | アクティブビュー再描画 + Stats 更新 |
| `viewChanged` | カンバン↔カレンダー切替 | レイアウト切替 |
| `calNavChanged` | 月移動 | カレンダー再描画 |
| `selectionChanged` | タスク選択変更 | カード選択スタイル更新 |
| `focusChanged` | カラムフォーカス変更 | カラム強調スタイル更新 |
| `taskCompleted` | タスクが Done に到達 | (演出フック用) |

---

## 3. データモデル

### Task

```js
{
  id:          string,          // UUID (crypto.randomUUID)
  columnId:    string,          // 所属カラムの UUID
  title:       string,          // タスクタイトル (必須)
  description: string,          // 詳細テキスト
  priority:    'none' | 'low' | 'medium' | 'high' | 'urgent',
  tags:        string[],        // タグ (現在 UI 未実装、将来拡張用)
  links:       Link[],          // 添付リンク
  attachments: Attachment[],    // 添付画像 (Base64)
  subtasks:    Subtask[],       // チェックリスト
  dueDate:     number | null,   // 期限 (Unix ms)
  completedAt: number | null,   // Done カラム到達時刻 (Unix ms)
  createdAt:   number,          // 作成時刻 (Unix ms)
  updatedAt:   number,          // 最終更新時刻 (Unix ms)
}
```

**Link**
```js
{ id: string, url: string, title: string }
```

**Attachment**
```js
{ id: string, name: string, dataUrl: string (Base64), size: number (bytes) }
```

**Subtask**
```js
{ id: string, text: string, done: boolean }
```

### Column

```js
{
  id:        string,      // UUID
  boardId:   string,      // 所属ボードの UUID
  name:      string,      // カラム名 (インライン編集可)
  color:     string,      // hex カラー (#RRGGBB)
  wipLimit:  number|null, // WIP 上限 (null = 制限なし)
  taskOrder: string[],    // タスク UUID の順序配列
}
```

### Board

```js
{
  id:          string,    // UUID
  name:        string,    // ボード名 (インライン編集可)
  columnOrder: string[], // カラム UUID の順序配列
  createdAt:   number,
  updatedAt:   number,
}
```

### Store State

```js
{
  boards:          Board[],
  columns:         Column[],
  tasks:           Task[],
  currentBoardId:  string,
  selectedTaskId:  string | null,
  focusedColumnId: string | null,
  view:            'kanban' | 'calendar',
  calYear:         number,
  calMonth:        number,   // 1-12
}
```

### デフォルトボード

初回起動時に自動生成するカラム:

| # | 名前 | カラー | 役割 |
|---|------|--------|------|
| 1 | ToDo | `#6366f1` (紫) | 未着手 |
| 2 | Doing | `#f59e0b` (黄) | 作業中 |
| 3 | Review | `#8b5cf6` (薄紫) | レビュー中 |
| 4 | Done | `#10b981` (緑) | 完了 ← 最終カラム |

> **最終カラム判定**: `board.columnOrder` の末尾 ID が Done カラムとして扱われる。カラム名には依存しない。

---

## 4. 永続化・ストレージ

### IndexedDB

| 設定 | 値 |
|------|---|
| DB 名 | `TaskStationDB` |
| バージョン | `1` |

#### Object Stores

| ストア名 | keyPath | インデックス |
|---------|---------|------------|
| `boards` | `id` | — |
| `columns` | `id` | `boardId` |
| `tasks` | `id` | `columnId` |

#### DB 操作 API (TaskDB クラス)

```js
await db.init()                 // DB オープン / スキーマ作成
await db.getAll('tasks')        // 全件取得
await db.put('tasks', task)     // 挿入または更新
await db.delete('tasks', id)    // 削除
await db.putMany('columns', []) // バッチ更新
```

### localStorage

| キー | 型 | 用途 |
|-----|---|------|
| `lastView` | `'kanban' \| 'calendar'` | 最後に使用したビューの復元 |
| `calYear` | string (数値) | カレンダー表示年 |
| `calMonth` | string (数値) | カレンダー表示月 |

### エクスポート / インポート

- **エクスポート**: ツールバーの「↑ エクスポート」ボタン → `taskstation-backup-YYYY-MM-DD.json`
- **インポート**: ツールバーの「↓ インポート」ボタン → JSON ファイル選択 → 全データ上書き

```json
// エクスポート JSON フォーマット
{
  "version": 1,
  "exportedAt": 1234567890000,
  "boards": [...],
  "columns": [...],
  "tasks": [...]
}
```

---

## 5. 画面構成・UI コンポーネント

### レイアウト

```
┌─────────────────────────────────────────────┐
│ Toolbar (48px固定)                           │
│ [ボード名] [カンバン][カレンダー] [+カラム]   │
│ [今日X/全Y] [↑出力][↓入力][?]               │
├─────────────────────────────────────────────┤
│                                             │
│  カンバンビュー  or  カレンダービュー         │
│  (V キーで切替)                             │
│                                             │
└─────────────────────────────────────────────┘
```

### ツールバー

| 要素 | 操作 |
|------|------|
| ボード名 | クリックでインライン編集 |
| カンバン/カレンダーボタン | ビュー切替 (V キーと同等) |
| + カラム追加 | 新規カラム作成 (C キーと同等) |
| 今日X / 全Y | 今日完了数 / 全タスク数のリアルタイム表示 |
| ↑ エクスポート | JSON ファイルダウンロード |
| ↓ インポート | JSON ファイル読み込み |
| ? | キーボードショートカット一覧モーダル |

---

## 6. 機能仕様

### 6-1. カンバンビュー

#### カラム操作

- **作成**: C キー または「+ カラム追加」ボタン
- **名前変更**: カラム名をクリックしてインライン編集 → Enter or Blur で確定
- **カラーピッカー**: カラムメニュー (···) → 「カラー変更」
- **WIP 制限**: カラムメニュー → 「WIP 上限設定」→ 数値入力 (超過時は赤バッジ表示)
- **削除**: カラムメニュー → 「カラムを削除」→ 確認ダイアログ (配下タスクも全削除)

#### タスクカード

カード上に表示される情報:

| 要素 | 表示条件 |
|------|---------|
| 優先度バー (左端 3px) | 常時 |
| タイトル | 常時 |
| 説明プレビュー (最大 72 文字) | description がある場合 |
| サブタスク進捗バー | subtasks がある場合 |
| 期限バッジ | dueDate がある場合 |
| リンク数 (↗N) | links が 1 件以上 |
| 添付数 (◫N) | attachments が 1 件以上 |

期限バッジの色分け:

| 状態 | 表示 | スタイル |
|------|------|---------|
| 今日 | 「今日」 | 赤文字 + 背景 |
| 明日 | 「明日」 | 橙文字 |
| 今週金曜 | 「今週金」 | 黄文字 |
| 来週金曜 | 「来週金」 | 通常 |
| それ以外 | 「M/D」 | 通常 |
| 期限超過 | 「M/D ⚠」 | 赤文字 + ⚠ |

#### D&D (ドラッグ&ドロップ)

- タスクカードをドラッグ → 別カラム・別位置にドロップで移動
- ドロップ時: `Store.moveTask()` が呼ばれ、Done カラムへの移動で `completedAt` が自動設定
- Done カラムから出すと `completedAt = null` にリセット
- ドロップ位置ガイド (プレースホルダー) を表示

#### Done カラムの自動非表示

- Done カラムのタスクは `completedAt >= 今日0時` のものだけ表示
- `completedAt` がない (Done に直接作成した場合) はそのまま表示
- 翌日 0 時を過ぎると自動的に非表示になる (次回 render 時)

#### Undo

- `Ctrl+Z`: 最後の操作を取り消し
- 対象操作: タスク作成・更新・削除・移動
- 最大 20 件まで履歴保持 (FIFO)

---

### 6-2. タスクモーダル

タスクの作成・編集を行うモーダルダイアログ。

#### Tab 順序

```
タイトル (1) → 詳細 (2) → 期限 (3) → 優先度 (4) → キャンセル (5) → 登録/更新 (6)
```

#### 期限入力ルール

| 入力方法 | 動作 |
|---------|------|
| `MMDD` 4 桁 (例: `0521`) | 5/21 として解釈。過去日なら翌年 |
| カレンダーピッカー (📅) | 日付を正確に選択 |
| 空欄のまま TAB で次へ | **次の金曜日** 正午を自動設定 |
| 今日が金曜 → 空欄 TAB | **翌週金曜** を設定 |

> カレンダーピッカーで選択した場合は `_exactDueTs` に保存され、MMDD 解釈より優先される。

#### 優先度

| キー | 値 | 色 |
|-----|---|---|
| 1 | none | グレー |
| 2 | low | 青 |
| 3 | medium | 黄褐色 |
| 4 | high | 橙 |
| 5 | urgent | 赤 |

#### リンク追加

- URL を入力して「追加」→ `http:` / `https:` / `mailto:` のみ許可
- タイトルが空なら URL 自体をラベルにする
- カード上に「↗N」バッジで件数表示

#### 画像添付

- 「ファイルを選択」ボタンまたは `Ctrl+V` でクリップボードから貼付
- Base64 エンコードして IndexedDB に保存
- **上限: 1 ファイル 5 MB**
- 画像プレビューのサムネイル表示、クリックで全画面表示

#### サブタスク (チェックリスト)

- 「+ サブタスクを追加」→ Enter で複数追加
- チェックボックスで完了/未完了切替
- カード上にプログレスバー表示 (完了数/総数)

---

### 6-3. Quick Capture

`Q` キーで開くワンライン入力バー。

#### 構文

```
[タイトル] [!優先度] [@期限]

例: 設計書を書く !4 @0521
```

| トークン | 書式 | 意味 |
|---------|------|------|
| `!1` `!2` | 数値 1-2 | 優先度 low |
| `!3` | 数値 3 | 優先度 medium |
| `!4` | 数値 4 | 優先度 high |
| `!5` | 数値 5 | 優先度 urgent |
| `@MMDD` | 4 桁数値 | 期限 (過去日 → 翌年) |

- タイトルは `!N` と `@MMDD` を除去した残りのテキスト
- 送信先: フォーカス中のカラム。フォーカスがなければ先頭カラム
- Enter で送信。`Ctrl+Enter` または `Esc` で閉じる

---

### 6-4. Command Palette

`Ctrl+K` または `/` で開くインクリメンタルサーチ。

- 全タスクのタイトルをリアルタイム検索
- ↑↓ で候補を移動、Enter で編集モーダルを開く
- Esc で閉じる
- 各候補に優先度・期限・カラム名を表示

---

### 6-5. カレンダービュー

#### グリッド仕様

- **表示**: 月〜金のみ (土日は完全に非表示)
- **グリッド**: 5 列 CSS Grid
- **フィルター**: Review カラム・Done カラムのタスクは表示しない (後ろから 2 カラム)
- **最大表示件数**: 1 日のセルに最大 3 件

#### タスクの日付移動

**キーボード** (ミニカードにフォーカスした状態で):

| キー | 移動量 | 備考 |
|-----|--------|------|
| `→` | +1 平日 | 土日に着地 → 月曜へスキップ |
| `←` | -1 平日 | 土日に着地 → 金曜へスキップ |
| `↓` | +7 日 | 同一曜日に移動 (週末スキップ不要) |
| `↑` | -7 日 | 同上 |

**右クリックメニュー** (ミニカード上で右クリック):

| 項目 | 動作 |
|------|------|
| 前日へ (←) | -1 平日 (土日スキップあり) |
| 翌日へ (→) | +1 平日 (土日スキップあり) |
| +1週間 (↓) | +7 日 |
| −1週間 (↑) | -7 日 |
| 期限をクリア | dueDate = null |
| 編集... | 編集モーダルを開く |

**ドラッグ&ドロップ**: セルにドロップで期限変更

#### 隠れタスクのスクロール (>3件の日)

1 日に 4 件以上のタスクがある場合:

- `↓N件` インジケーター → クリックまたは `Ctrl/Alt+↓` で次のタスクを表示
- `↑N件` インジケーター → クリックまたは `Ctrl/Alt+↑` で前のタスクを表示
- スクロール位置 (`_cellOffsets`) はインスタンスに保持。月をまたいでも維持
- `Ctrl/Alt+↑↓` はミニカードにフォーカスした状態でも動作 (セルへイベントがバブル)

#### 期限なしタスクエリア

グリッド下部に「期限なし (N件)」セクション。Review・Done 以外のタスクを表示。D&D でここにドロップすると `dueDate = null` に設定。

---

### 6-6. 完了実績グラフ (Contribution Graph)

カレンダービューの最下部に表示。

#### レイアウト

```
         [直近2週間の完了実績]              少 □□□□ 多
朝 | 5/12 5/13 5/14 5/15 5/16 | 5/19 5/20 5/21 5/22 5/23
昼 | ■  □  ■  ■  □  | □  ■  □  □  ■
夕 | □  □  □  ■  □  | □  □  ■  □  □
夜 | □  □  □  □  □  | □  □  □  □  □
```

#### 時間スロット

| ラベル | 時間帯 |
|-------|-------|
| 朝 | 05:00 〜 11:59 |
| 昼 | 12:00 〜 17:59 |
| 夕 | 18:00 〜 21:59 |
| 夜 | 22:00 〜 04:59 (深夜またぎ) |

#### 色レベル (completedAt 件数)

| レベル | 件数 | 色 |
|-------|------|----|
| lv0 | 0 件 | 背景色 (無色) |
| lv1 | 1 件 | 薄紫 20% |
| lv2 | 2〜3 件 | 薄紫 50% |
| lv3 | 4 件以上 | 薄紫 80% |

#### 表示日付のルール

- 通常: 直近 10 平日 (月〜金)
- **今日が土日の場合**: 直近 9 平日 + 今日 (土日でも当日分を可視化)

---

## 7. キーボードショートカット

### グローバル (どこからでも)

| キー | 動作 |
|-----|------|
| `Q` | Quick Capture を開く |
| `Ctrl+K` または `/` | Command Palette を開く |
| `N` | 新規タスク作成 |
| `C` | 新規カラム作成 |
| `V` | カンバン ↔ カレンダー切替 |
| `Ctrl+Z` | アンドゥ |
| `?` | ショートカット一覧を開く |

### カンバンビュー (タスク操作)

| キー | 動作 |
|-----|------|
| `↑` / `↓` | タスク選択移動 |
| `←` / `→` | カラムフォーカス移動 |
| `Shift+←` / `Shift+→` | 選択タスクを隣のカラムへ移動 |
| `Shift+↑` / `Shift+↓` | 選択タスクをカラム内で移動 |
| `Enter` | 選択タスクを編集 |
| `E` | 選択タスクを編集 (Enter と同等) |
| `D` | 選択タスクを削除 (確認あり) |
| `Esc` | タスク選択解除 |

### カレンダービュー

| キー | 動作 |
|-----|------|
| `H` | 前月へ |
| `L` | 翌月へ |
| `N` (セルフォーカス時) | その日付でタスク作成 |
| `←` (ミニカードフォーカス) | 期限を -1 平日 |
| `→` (ミニカードフォーカス) | 期限を +1 平日 |
| `↑` (ミニカードフォーカス) | 期限を -7 日 |
| `↓` (ミニカードフォーカス) | 期限を +7 日 |
| `Ctrl+↓` / `Alt+↓` | セル内の次のタスクを表示 |
| `Ctrl+↑` / `Alt+↑` | セル内の前のタスクを表示 |
| `Enter` / `Space` (ミニカード) | 編集モーダルを開く |
| 右クリック (ミニカード) | 日付変更メニューを表示 |

### モーダル内

| キー | 動作 |
|-----|------|
| `Ctrl+Enter` | タスクを保存 |
| `Esc` | モーダルを閉じる |
| `Tab` | 次フィールドへ |
| `1` 〜 `5` | 優先度を設定 |
| `Ctrl+V` | クリップボードから画像を貼付 |

---

## 8. クラス設計・API

### TaskDB

IndexedDB の Promise ラッパー。トランザクション管理を隠蔽。

```js
class TaskDB {
  async init()                        // DB 作成 / バージョン管理
  async getAll(storeName)             // 全件取得 → Array
  async put(storeName, record)        // Upsert
  async delete(storeName, id)         // 削除
  async putMany(storeName, records)   // バッチ Upsert
}
```

### Store

アプリケーション状態の唯一の真実 (Single Source of Truth)。

```js
class Store {
  // イベントバス
  on(event, callback) → unsubscribeFn
  emit(event, data)

  // ゲッター
  get board()         // 現在のボード
  get columns()       // columnOrder 順に並んだ Column[]

  // クエリ
  getColumnTasks(columnId)  // カラム内タスクを taskOrder 順に返す
  getAllTasks()              // 現在ボードの全タスク

  // データ操作 (全て async、Undo 登録 + emit('changed'))
  async createTask(columnId, data)
  async updateTask(taskId, updates)
  async deleteTask(taskId)
  async moveTask(taskId, toColumnId, toIndex)
  async createColumn(name)
  async updateColumn(colId, updates)
  async deleteColumn(colId)

  // ビュー状態
  setView(view)                  // localStorage に保存
  setCalendarNav(year, month)    // localStorage に保存
  selectTask(taskId)
  focusColumn(colId)
  async undo()
}
```

### BoardView

カンバンビューのレンダリング。`store.on('changed')` で `render()` を呼ぶ。

```js
class BoardView {
  render()                     // 全カラムを再描画
  _renderColumn(col)           // カラム要素生成
  _renderTask(task)            // タスクカード要素生成
  _formatDue(ts)               // 期限を "今日"/"明日"/... に整形
  _showColMenu(e, col)         // カラムコンテキストメニュー
  _esc(str)                    // HTML エスケープ
}
```

### CalendarView

カレンダービューのレンダリング + 完了実績グラフ。

```js
class CalendarView {
  // 状態
  _cellOffsets  // { "YYYY-M-D": offset } — セルのスクロール位置
  _ctxCleanup   // 現在開いているコンテキストメニューのクリーンアップ関数

  render()
  _renderHeader(year, month)
  _renderDayLabels()
  _renderGrid(year, month)
  _renderDayCell(day, date, tasks, isToday, dow)   // タスクスクロール付きセル
  _renderMiniCard(task)                             // キー操作・右クリック付き
  _showContextMenu(task, x, y)                      // リスナーリーク対策済み
  _skipToWorkday(date, movedForward)                // 土日スキップ
  _renderNodue()                                    // 期限なしタスクエリア
  _navigate(delta)
  _renderContribution()                             // 完了実績グラフ
  _getLastWorkdays(n)                               // 直近 n 平日 (土日でも当日含む)
  _countInSlot(tasks, day, slot)                    // 時間スロット別件数
  _esc(str)
}
```

### Modal

```js
class Modal {
  openCreate(columnId, presetDueDate)
  openEdit(taskId)
  close()

  // 内部
  _submit()             // バリデーション + 保存
  _reset()
  _populate(task)       // 編集時にフォームへデータを流し込む
  _resolveDueDate()     // exactDueTs → MMDD パース → null の優先順位で解決
  _parseMmdd(val)       // "0521" → Date or null
  _isSafeUrl(url)       // http/https/mailto のみ許可
  _handlePaste(e)       // Ctrl+V での画像貼付
  _addAttachmentFile(file)
}
```

### QuickCapture

```js
class QuickCapture {
  open()
  close()
  _parse(raw)   // → { title, priority, dueDate }
}
```

### CommandPalette

```js
class CommandPalette {
  open()
  close()
  _render()     // インクリメンタル検索結果を描画
}
```

### DragManager

HTML5 Drag & Drop のグローバルハンドラ。`document` にイベントを登録。
カード間のプレースホルダー挿入と `store.moveTask()` の呼び出しを担当。

### KeyboardManager

`document.addEventListener('keydown', ...)` でグローバルショートカットを処理。
テキスト入力中 (`INPUT`, `TEXTAREA`, `contenteditable`) は無視。

---

## 9. セキュリティ

### XSS 対策

`_esc(str)` 関数を全クラスで定義。ユーザー入力を DOM に挿入する際は必ず経由。

```js
_esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

適用箇所: タスクタイトル / 説明 / カラム名 / リンクタイトル / 添付ファイル名

### URL 検証

```js
_isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch { return false; }
}
```

外部リンクには `rel="noopener noreferrer" target="_blank"` を付与。

### カラーコード検証

カラム色などユーザー指定の CSS 値は `/^#[0-9a-fA-F]{3,8}$/` で検証し、
不正な場合は `#6366f1` (デフォルト紫) にフォールバック。

### 入力サニタイズ

| 箇所 | 制限 |
|------|-----|
| 期限入力 | 数値のみ、最大 4 文字 |
| 画像添付 | 5 MB 上限 / `image/*` タイプのみ |
| Quick Capture | `!N @MMDD` 以外はタイトル文字列として扱う (eval 等なし) |

### 外部通信

**一切なし。** CDN・API・アナリティクス・フォント読み込みなし。

---

## 10. デザインシステム

### カラーパレット (CSS Custom Properties)

#### ライトモード

| 変数 | 値 | 用途 |
|-----|----|------|
| `--bg` | `#f6f8fa` | ページ背景 |
| `--bg-2` | `#ffffff` | カード・カラム背景 |
| `--surface` | `#ffffff` | ツールバー・モーダル |
| `--border` | `#d0d7de` | 境界線 |
| `--border-focus` | `#6366f1` | フォーカスリング |
| `--text` | `#1f2328` | 本文 |
| `--text-2` | `#57606a` | 補助テキスト |
| `--text-3` | `#818c99` | プレースホルダー |

#### ダークモード (`prefers-color-scheme: dark`)

| 変数 | 値 |
|-----|----|
| `--bg` | `#0d1117` |
| `--bg-2` | `#161b22` |
| `--surface` | `#161b22` |
| `--border` | `#30363d` |
| `--text` | `#e6edf3` |

#### 優先度カラー

| 優先度 | ライト | ダーク |
|-------|-------|-------|
| none | `#d0d7de` | 同左 |
| low | `#0969da` | `#388bfd` |
| medium | `#9a6700` | `#d29922` |
| high | `#bc4c00` | `#db6d28` |
| urgent | `#cf222e` | `#f85149` |

### タイポグラフィ

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
             'Hiragino Sans', 'Noto Sans JP', sans-serif;
font-size: 14px;
line-height: 1.5;
```

### シャドウ・ラジウス

| 変数 | 値 | 用途 |
|-----|----|------|
| `--radius-sm` | 4px | バッジ・小要素 |
| `--radius` | 6px | ボタン・インプット |
| `--radius-lg` | 8px | カード・カラム |
| `--shadow` | 極薄い境界線影 | カード通常状態 |
| `--shadow-md` | 3px blur | ホバー |
| `--shadow-lg` | 8px blur | モーダル・メニュー |

### トランジション

```css
--transition: 0.1s ease;  /* 全ての hover アニメーション */
```

---

## 11. 既知の制約・仕様上の限界

| 項目 | 制約 | 理由 |
|------|------|------|
| ボード数 | 1 ボード固定 | 複数ボード UI 未実装 |
| 画像添付 | 1 ファイル 5 MB 上限 | IndexedDB の実用的な上限 |
| Undo 履歴 | 最大 20 件 | メモリ節約 (FIFO) |
| 完了実績グラフ | 直近 10 平日のみ | 表示領域の都合 |
| カレンダー表示 | 月〜金のみ | 週末のタスクは非表示 (期限設定は可能) |
| タグ機能 | データ構造のみ実装 | フィルタリング UI は未実装 |
| 期限なしの土日 | 期限を土日に設定してもカレンダーに表示されない | 設計上の仕様 |
| オフライン | 常にオフライン | 設計上の仕様 (ローカルファースト) |

---

*以上が Task Station の全仕様である。*
