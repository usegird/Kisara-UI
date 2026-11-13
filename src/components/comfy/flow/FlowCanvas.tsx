import { DndContext, type AutoScrollOptions, type DragMoveEvent } from '@dnd-kit/core';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AnchorContext } from '@/components/comfy/flow/anchor-context';
import { DragEdgeScroll } from '@/components/comfy/flow/DragEdgeScroll';
import { canvasFrame, columnRow, flowScroller } from '@/components/comfy/flow/flow-canvas-look';
import {
  boxKey,
  cardStatesOf,
  embedOffset,
  flowColumnWidthsOf,
  flowOptionsOf,
  openFramesOf,
  registerFlowViewport,
  settingsNodeOf,
  variableBoxesOf,
} from '@/components/comfy/flow/flow-canvas-values';
import { sortableSlot } from '@/components/comfy/flow/flow-dnd';
import { FlowLookContext, type FlowLook } from '@/components/comfy/flow/flow-look-context';
import { FlowCardList } from '@/components/comfy/flow/FlowCardList';
import { AppGap, AppInputColumn, CardColumn } from '@/components/comfy/flow/FlowColumns';
import {
  ConnectorLayer,
  DragCover,
  EmbedHost,
  FlowDragOverlay,
  OpenWorkflowHint,
} from '@/components/comfy/flow/FlowLayers';
import { FlowPopups } from '@/components/comfy/flow/FlowPopups';
import { VariableSide } from '@/components/comfy/flow/FlowVariableColumn';
import { LinkDragContext } from '@/components/comfy/flow/link-drag-context';
import { MissingDefinitionsNotice } from '@/components/comfy/flow/MissingDefinitionsNotice';
import { focusTappedField } from '@/components/comfy/flow/tap-to-edit';
import { useCardActions } from '@/components/comfy/flow/use-card-actions';
import { useEmbedOverlay } from '@/components/comfy/flow/use-embed-overlay';
import { useFlowDnd } from '@/components/comfy/flow/use-flow-dnd';
import { useFlowScrolling } from '@/components/comfy/flow/use-flow-scrolling';
import { VariablePanel } from '@/components/comfy/flow/VariablePanel';
import { ZoomButtons } from '@/components/comfy/flow/ZoomButtons';
import { dragAccessibility } from '@/components/ui/drag-announcements';
import { RenderProbe } from '@/components/ui/render-probe';
import { groupVariableBoxes } from '@/graph/variables';
import { useAppInputColumn } from '@/hooks/flow/use-app-input-column';
import { useCardClipboard } from '@/hooks/flow/use-card-clipboard';
import { useCardGroups } from '@/hooks/flow/use-card-groups';
import { useCardShortcuts } from '@/hooks/flow/use-card-shortcuts';
import { useComboOptions } from '@/hooks/flow/use-combo-options';
import { useDisplayGraph } from '@/hooks/flow/use-display-graph';
import { useCardMotion } from '@/hooks/flow/use-flow-motion';
import { useNodeEditing } from '@/hooks/flow/use-node-editing';
import { useNodeViews } from '@/hooks/flow/use-node-views';
import { useAnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { useNarrowScreen } from '@/hooks/ui/use-narrow-screen';
import { useReusedItems } from '@/hooks/ui/use-reused-items';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 全体コンテナ。列（アプリ入力 / カード / 変数）を並べて接続線を重ねる組み立てだけを持つ（ドラッグは
// use-flow-dnd、編集は use-node-editing、列の送り・倍率は use-flow-scrolling、左の列は use-app-input-column）。
// ─────────────────────────────

/** 掴んで送らないときの受け口（何も付けない） */
const NO_PAN = {};

/**
 * 並べ替えでの dnd-kit の送り。縦だけ送り、横は送らない。
 * 横の送り出しを 0 にすると、画面の端へ寄せても全体が横に流れない（縦は dnd-kit の既定の 20%）
 */
const SORT_AUTO_SCROLL: AutoScrollOptions = { threshold: { x: 0, y: 0.2 } };

/**
 * 本体の列の部品の出し分け。既定は本体の見た目で、デモは外す・切り替えるものを渡す
 */
export interface FlowCanvasProps {
  /** アプリ入力の列の脇の差し込み（Lora・スタイル・ワイルドカード）。デモでは外す */
  readonly insertBar?: boolean;
  /** カードのメニューの「詳細設定…」。デモでは外す */
  readonly nodeSettings?: boolean;
  /** カード列の脇のアイコン（隠す切り替え・処理順に並べる）。デモでは外す */
  readonly cardTools?: boolean;
  /** アプリ入力の項目のカードの値の取り込み。デモでは外す */
  readonly appImport?: boolean;
  /** アプリ入力の列の送りのバーを左に出す。デモでは右（ふつう）のまま */
  readonly appScrollbarLeft?: boolean;
  /** カードのコメントを名前の下の 2 行目に出す。デモで使う */
  readonly commentBelow?: boolean;
  /** 出力チップを縦に並べ、線をチップごとに出す。デモで使う */
  readonly chipOutputs?: boolean;
  /** 列の外へ出たカードとの間の変数の線。デモでは出す側のカードが見えているときだけ引く */
  readonly offscreenLines?: boolean;
  /** アプリ入力の枠の ×。デモでは外す */
  readonly appRemove?: boolean;
  /** 押して列を送る操作（線を押して揃える・変数の見出しでカードへ送る）。デモでは外す */
  readonly clickScroll?: boolean;
  /** 何も無い所を掴んで全体を送る。デモでは外す */
  readonly dragPan?: boolean;
  /** 大きな部品の内側の余白を倍にする。デモで使う */
  readonly roomy?: boolean;
}

/**
 * ComfyUI タブの本体。アプリ入力・カード・変数の列と接続線、ノードの検索と詳細設定のダイアログを描く。
 * 列はそれぞれ独立して縦に送り、横だけは並び全体を送る
 */
export function FlowCanvas(props: FlowCanvasProps): React.ReactElement {
  const {
    insertBar,
    nodeSettings,
    cardTools,
    appImport,
    appScrollbarLeft,
    commentBelow,
    chipOutputs,
    offscreenLines,
    appRemove,
    clickScroll,
    dragPan,
    roomy,
  } = flowOptionsOf(props);
  const workflow = useGraphStore((state) => state.workflow);
  const updateNodeSettings = useGraphStore((state) => state.updateNodeSettings);
  const disconnectLinks = useGraphStore((state) => state.disconnectLinks);
  // カード・変数・線は表示用のワークフロー（開いた subgraph の中を差し込んだもの）から作る
  const display = useDisplayGraph();
  const shown = display?.workflow ?? null;
  const open = openFramesOf(display);
  // 本体の 5 つの幅だけを読む（右の列の幅を変えても本体を描き直さない）
  const columnWidths = useSettingsStore(useShallow(flowColumnWidthsOf));
  const resizeColumn = useSettingsStore((state) => state.resizeColumn);
  const definitions = useDefinitionsStore((state) => state.definitions);

  // 実行状態をカードへ。**中身が同じなら前回の Map を返す**。
  // 進捗の通知はノードの状態を作り直すので、そのまま受けると通知のたびにカード列が描き直しになる
  const cardStates = useExecutionStore(
    useShallow((state) => cardStatesOf(state.nodeStates, state.error?.node ?? null, open)),
  );

  const dnd = useFlowDnd();
  const editing = useNodeEditing();

  const anchors = useAnchorRegistry();
  const remeasure = anchors.remeasure;
  // 掴んで動かしている間は、落とす先へ置き直して見せる。
  // 線の引き直しは、リンクのドラッグでは動くたびに行う。カード・グループの並べ替えでは並びが動くのは
  // 置き直したときだけなので、そのときだけ測り直す（動くたびに全部の位置を測ると、そのたびに
  // 描画の計算をやり直させる。送りは台帳が自分で追う）
  const { onDragMove: hintDrop, preview } = dnd;
  const onDragMove = (event: DragMoveEvent): void => {
    if (sortableSlot(event.active.data.current) === null) remeasure();
    hintDrop(event);
  };
  useEffect(() => remeasure(), [preview, remeasure]);
  // 画面から足したカードは右から滑り込み、消すカードは右へ抜ける。その間は線も付いて動く
  const motion = useCardMotion(remeasure);
  // 列の送り・揃え・倍率と、何も無い所を掴んだときの全体の送り。
  // 分けて受ける（`ref` に渡す入口を持つ物をまとめて読むと、lint が全部を ref と誤検知する）
  const {
    attachFlowScroll,
    attachAppScroll,
    attachCardScroll,
    attachVariableScroll,
    attachRow,
    holdVariables,
    scrollColumns,
    align,
    revealCard,
    revealGroup,
    forwardWheel,
    pan,
    zoom,
    zoomBy,
  } = useFlowScrolling(anchors, dnd.draggingRoot);

  const actions = useCardActions(editing.setSearch, motion);
  useCardClipboard(actions.pasteCard);
  useCardShortcuts(actions.deleteSelected);
  const cardGroups = useCardGroups(shown);

  // 並べ替え・挿入・整列は位置だけが変わり ResizeObserver が反応しないので、
  // グラフが変わったら測り直す
  useEffect(() => remeasure(), [workflow, remeasure]);

  const views = useNodeViews();
  // 変数の列は、カードを隠したノードの出力も出す（線を引く元として使えるように）
  const allViews = useNodeViews({ includeHidden: true });
  // 選択肢は**行が出た時点**で取る（押してから取ると 1 回目が読み込みに消える）
  useComboOptions(views);

  // アプリ入力の列へ渡すもの（枠・幅・高さ）と、カード側の印からの切り替え
  const appInputs = useAppInputColumn(workflow, views, remeasure);

  // 中身が同じ箱は前回のものを渡す（1 か所の編集で全部の箱を描き直さない）
  const boxes = useReusedItems(variableBoxesOf(shown, definitions), boxKey);
  // パネルではカード単位のグループとして囲む
  const groups = groupVariableBoxes(allViews, boxes);

  const settingsNode = settingsNodeOf(shown, editing.settingsFor);

  // 狭い画面では 1 列だけを出す。開いたときはカードの列
  const narrow = useNarrowScreen();
  // 埋め込みは、横に並べるときはアプリ入力より右、狭い画面では見えている範囲の全体を覆う
  const { setEmbedHost, overlaid, overlayStyle } = useEmbedOverlay(
    anchors,
    narrow ? 0 : columnWidths.app + embedOffset(zoom.app),
  );
  // 見た目の切り替えは中身が同じなら同じものを渡す（カードの memo を崩さない）
  const look: FlowLook = {
    appImport,
    appRemove,
    commentBelow,
    chipOutputs,
    roomy,
    compact: narrow,
  };

  if (!workflow) return <OpenWorkflowHint />;

  const onZoomCards = (direction: number): void => zoomBy('cards', direction);
  const attachScroller = (element: HTMLDivElement | null): void => {
    attachFlowScroll(element);
    registerFlowViewport(anchors, element, { overlaid, narrow });
  };

  return (
    // 本体の描き直しを数える目印（中の部品が描き直したときも数える）
    <RenderProbe id="FlowCanvas">
      <AnchorContext.Provider value={anchors}>
        <FlowLookContext.Provider value={look}>
          {/* 出力チップ・変数ボックス → パラメータ行のドラッグ&ドロップ接続 */}
          <DndContext
            sensors={dnd.sensors}
            collisionDetection={dnd.collisionDetection}
            accessibility={dragAccessibility()}
            onDragMove={onDragMove}
            // 落とす先が変わった直後は onDragMove にまだ前の先が来るので、ここでも置き直しを決める
            onDragOver={dnd.onDragMove}
            onDragStart={dnd.onDragStart}
            onDragEnd={dnd.onDragEnd}
            onDragCancel={dnd.onDragCancel}
            // 出力を掴んでいる間は dnd-kit の送りを止め、カーソルのある列を送る（DragEdgeScroll）。
            // カード・グループの並べ替えは縦だけ送る
            autoScroll={dnd.dragging === null ? SORT_AUTO_SCROLL : false}
          >
            {/* パラメータ行の落とし先は、出力を掴んでいる間だけ置く */}
            <LinkDragContext.Provider value={dnd.dragging !== null}>
              {/* 上の余白 8px が列の上端の基準線。右の列のタブの上端もここに揃える */}
              {/* 指では欄を押してから書き換える（上から画面を送れるように） */}
              <div className={canvasFrame({ narrow })} onClick={focusTappedField}>
                <MissingDefinitionsNotice empty={definitions.size === 0} />
                {narrow ? <ZoomButtons onZoom={onZoomCards} /> : null}
                {/* 横に送る枠。**縦は列が自分で送る**ので、ここでは縦を止める
              （横を auto にすると縦も auto になり、二重に動く） */}
                {/* アプリ入力の列を左へ寄せたぶん（9px）、横に送る枠も左へ広げて欠けないようにする
              （枠の外へ出たところは切られるため）。上は広げない（3 列とも基準線から始める） */}
                {/* 何も無い所を掴んで動かすと全体を送る（中身の上では掴まない） */}
                <div
                  ref={attachScroller}
                  className={flowScroller({ narrow })}
                  {...(dragPan ? pan : NO_PAN)}
                >
                  {/* カードを左、変数を右に寄せ、間を接続線の領域として広く取る。
                **列は互いを削らない**（`w-max`）。入り切らない分は右へはみ出し、
                余白と変数が先に押し出される */}
                  {/* 掴んでいる間は、列の中身のホバーを止める。
                落とし先は矩形で判定するので、ポインタのイベントが無くても決まる。
                `data-dragging` は useFlowDnd が直接付け外しする（描き直さないため） */}
                  <div ref={attachRow} className={columnRow({ narrow })} onWheel={forwardWheel}>
                    <AppInputColumn
                      narrow={narrow}
                      width={columnWidths.app}
                      zoom={zoom.app}
                      attachScroll={attachAppScroll}
                      resetKey={workflow}
                      appInputs={appInputs}
                      onNeedOptions={editing.needOptions}
                      insertBar={insertBar}
                      scrollbarLeft={appScrollbarLeft}
                    />
                    <AppGap
                      narrow={narrow}
                      appWidth={columnWidths.app}
                      gapWidth={columnWidths.appGap}
                      onResize={resizeColumn}
                    />

                    <CardColumn
                      narrow={narrow}
                      width={columnWidths.cards}
                      zoom={zoom.cards}
                      attachScroll={attachCardScroll}
                      tools={cardTools}
                    >
                      <FlowCardList
                        views={views}
                        definitionsLoaded={definitions.size > 0}
                        cardGroups={cardGroups}
                        preview={preview}
                        cardStates={cardStates}
                        onCommit={editing.commitValue}
                        onResizeText={editing.resizeText}
                        onNeedOptions={editing.needOptions}
                        onOpenSettings={nodeSettings ? editing.setSettingsFor : undefined}
                        actions={actions}
                        motion={motion}
                        onToggleAppInput={appInputs.toggle}
                        frames={display?.frames}
                      />
                    </CardColumn>
                    <VariableSide
                      narrow={narrow}
                      widths={columnWidths}
                      resetKey={workflow}
                      onResize={resizeColumn}
                    >
                      <VariablePanel
                        groups={groups}
                        width={narrow ? undefined : columnWidths.variables}
                        narrow={narrow}
                        zoom={zoom.variables}
                        attachScroll={attachVariableScroll}
                        onHoldReady={holdVariables}
                        groupOf={cardGroups.groupOf}
                        groupParents={cardGroups.groupParents}
                        groupLabels={cardGroups.groupLabels}
                        onReveal={clickScroll ? revealCard : undefined}
                        onRevealGroup={clickScroll ? revealGroup : undefined}
                        onAddAfter={actions.addAfter}
                      />
                    </VariableSide>

                    <ConnectorLayer
                      resetKey={workflow}
                      boxes={boxes}
                      appGroups={appInputs.groups}
                      proxyRows={display?.proxyRows}
                      onAlign={clickScroll ? align : undefined}
                      onInsert={actions.insertBetween}
                      onDisconnect={disconnectLinks}
                      chipOutputs={chipOutputs}
                      offscreenLines={offscreenLines}
                    />

                    <EmbedHost attachHost={setEmbedHost} style={overlayStyle} />
                    <DragCover />
                  </div>
                </div>
              </div>

              <FlowPopups
                editing={editing}
                settingsNode={settingsNode}
                views={views}
                allViews={allViews}
                definitions={definitions}
                onSettingsChange={updateNodeSettings}
                track={motion.track}
              />

              {/* つかんでいるものをカーソルに付けて出す */}
              <DragEdgeScroll columns={scrollColumns} />
              <FlowDragOverlay dragging={dnd.dragging} ghost={dnd.ghost} zoom={zoom.cards} />
            </LinkDragContext.Provider>
          </DndContext>
        </FlowLookContext.Provider>
      </AnchorContext.Provider>
    </RenderProbe>
  );
}
