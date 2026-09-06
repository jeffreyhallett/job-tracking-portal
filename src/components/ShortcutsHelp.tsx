import { SHORTCUTS } from "../lib/shortcuts";
import { Modal } from "./ui";

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={keys} className="contents">
            <dt>
              <kbd className="kbd whitespace-nowrap">{keys}</kbd>
            </dt>
            <dd className="text-fg-2">{what}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
