import * as RadixTooltip from '@radix-ui/react-tooltip';

/* ── 統一 Tooltip 包裝元件 ─────────────────────────────────
   使用 ft-tooltip CSS class（global.css），確保全局視覺一致。
   複雜多行內容（PanelHeader / PlanPage）請改用原始 Radix API
   搭配 className="ft-tooltip" 以保留完整排版控制。
   ──────────────────────────────────────────────────────── */

interface AppTooltipProps {
  /** Tooltip 顯示內容（字串或 JSX） */
  content:        React.ReactNode;
  /** 觸發元素（需為單一可渲染子節點，asChild 轉發） */
  children:       React.ReactNode;
  /** Tooltip 出現方向，預設 'top' */
  side?:          RadixTooltip.TooltipContentProps['side'];
  /** 與觸發元素的偏移距離（px），預設 5 */
  sideOffset?:    number;
  /** hover 延遲（ms），預設 300 */
  delayDuration?: number;
  /** 附加 CSS class（如 'ft-tooltip--wide'）*/
  extraClass?:    string;
}

export function AppTooltip({
  content,
  children,
  side          = 'top',
  sideOffset    = 5,
  delayDuration = 300,
  extraClass,
}: AppTooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild>
        {children}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          role="tooltip"
          side={side}
          sideOffset={sideOffset}
          className={extraClass ? `ft-tooltip ${extraClass}` : 'ft-tooltip'}
        >
          {content}
          <RadixTooltip.Arrow className="ft-tooltip__arrow" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
