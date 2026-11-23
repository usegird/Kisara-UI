import { DndContext, type AutoScrollOptions, type DragMoveEvent } from '@dnd-kit/core';
import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AnchorContext } from '@/components/comfy/flow/anchor-context';
import { DragEdgeScroll } from '@/components/comfy/flow/DragEdgeScroll';
import { EntranceContext } from '@/components/comfy/flow/entrance-context';
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
import { useSubfolderFixes } from '@/hooks/flow/use-subfolder-fixes';
import { useRevealRequest } from '@/hooks/run/use-reveal-request';
import { useAnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import { useNarrowScreen } from '@/hooks/ui/use-narrow-screen';
import { useReusedItems } from '@/hooks/ui/use-reused-items';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';

const NO_PAN = {};

const SORT_AUTO_SCROLL: AutoScrollOptions = { threshold: { x: 0, y: 0.2 } };

export interface FlowCanvasProps {
  readonly insertBar?: boolean;
  readonly nodeSettings?: boolean;
  readonly cardTools?: boolean;
  readonly appImport?: boolean;
  readonly appScrollbarLeft?: boolean;
  readonly commentBelow?: boolean;
  readonly chipOutputs?: boolean;
  readonly offscreenLines?: boolean;
  readonly appRemove?: boolean;
  readonly clickScroll?: boolean;
  readonly dragPan?: boolean;
  readonly roomy?: boolean;
}

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
  const display = useDisplayGraph();
  const shown = display?.workflow ?? null;
  const open = openFramesOf(display);
  const columnWidths = useSettingsStore(useShallow(flowColumnWidthsOf));
  const resizeColumn = useSettingsStore((state) => state.resizeColumn);
  const definitions = useDefinitionsStore((state) => state.definitions);

  const cardStates = useExecutionStore(
    useShallow((state) => cardStatesOf(state.nodeStates, state.error?.node ?? null, open)),
  );

  const dnd = useFlowDnd();
  const editing = useNodeEditing();

  const anchors = useAnchorRegistry();
  const remeasure = anchors.remeasure;
  const { onDragMove: hintDrop, preview } = dnd;
  const onDragMove = (event: DragMoveEvent): void => {
    if (sortableSlot(event.active.data.current) === null) remeasure();
    hintDrop(event);
  };
  useEffect(() => remeasure(), [preview, remeasure]);
  const motion = useCardMotion(remeasure);
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

  useRevealRequest(revealCard);
  const actions = useCardActions(editing.setSearch, motion);
  useCardClipboard(actions.pasteCard);
  useCardShortcuts(actions.deleteSelected);
  const cardGroups = useCardGroups(shown);

  useEffect(() => remeasure(), [workflow, remeasure]);

  const views = useNodeViews();
  const allViews = useNodeViews({ includeHidden: true });
  useComboOptions(views);
  useSubfolderFixes(views);

  const appInputs = useAppInputColumn(workflow, views, remeasure);

  const boxes = useReusedItems(variableBoxesOf(shown, definitions), boxKey);
  const groups = groupVariableBoxes(allViews, boxes);

  const settingsNode = settingsNodeOf(shown, editing.settingsFor);

  const narrow = useNarrowScreen();
  const { setEmbedHost, overlaid, overlayStyle } = useEmbedOverlay(
    anchors,
    narrow ? 0 : columnWidths.app + embedOffset(zoom.app),
  );
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
    <RenderProbe id="FlowCanvas">
      <AnchorContext.Provider value={anchors}>
        <FlowLookContext.Provider value={look}>
          <EntranceContext.Provider value={editing.addEntrance}>
            <DndContext
              sensors={dnd.sensors}
              collisionDetection={dnd.collisionDetection}
              accessibility={dragAccessibility()}
              onDragMove={onDragMove}
              onDragOver={dnd.onDragMove}
              onDragStart={dnd.onDragStart}
              onDragEnd={dnd.onDragEnd}
              onDragCancel={dnd.onDragCancel}
              autoScroll={dnd.dragging === null ? SORT_AUTO_SCROLL : false}
            >
              <LinkDragContext.Provider value={dnd.dragging !== null}>
                <div className={canvasFrame({ narrow })} onClick={focusTappedField}>
                  <MissingDefinitionsNotice empty={definitions.size === 0} />
                  {narrow ? <ZoomButtons onZoom={onZoomCards} /> : null}
                  <div
                    ref={attachScroller}
                    className={flowScroller({ narrow })}
                    {...(dragPan ? pan : NO_PAN)}
                  >
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

                <DragEdgeScroll columns={scrollColumns} />
                <FlowDragOverlay dragging={dnd.dragging} ghost={dnd.ghost} zoom={zoom.cards} />
              </LinkDragContext.Provider>
            </DndContext>
          </EntranceContext.Provider>
        </FlowLookContext.Provider>
      </AnchorContext.Provider>
    </RenderProbe>
  );
}
