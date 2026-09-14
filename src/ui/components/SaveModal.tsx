import React, { useEffect, useRef, useState } from 'react';
import { useStore, SaveMeta } from '../store';
import { Modal } from './common';
import { formatDay } from '../util';

const SLOTS = ['slot1', 'slot2', 'slot3'];

/** Save / load / import / export. `mode` = 'save' shows slot targets; 'load' lists saved games. */
export function SaveModal({ mode, onClose }: { mode: 'save' | 'load'; onClose: () => void }) {
  const { save, load, listSaves, deleteSave, exportSave, importSave, showToast } = useStore.getState();
  const storageOk = useStore((s) => s.storageOk);
  const current = useStore((s) => s.saveSlot);
  const hasGame = useStore((s) => s.state !== null);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => listSaves().then(setSaves);
  useEffect(() => { void refresh(); }, []);
  const meta = (slot: string) => saves.find((s) => s.slot === slot);

  const doExport = () => {
    const json = exportSave(); if (!json) return;
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `touchline-save-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      showToast('Save file downloaded');
    } catch { showToast('Export not available here'); }
  };
  const doImport = async (file: File) => {
    setBusy(true);
    const text = await file.text();
    const ok = await importSave(text);
    setBusy(false);
    showToast(ok ? 'Save imported' : 'That file is not a Touchline save');
    if (ok) onClose();
  };

  return (
    <Modal title={mode === 'save' ? 'Save game' : 'Load game'} onClose={onClose} width={620}>
      {storageOk === false && <div className="small red mb8">Browser storage is blocked in this context, so slots won't persist. Use Export/Import files instead.</div>}
      <div className="col gap4 mb16">
        {SLOTS.map((slot) => {
          const m = meta(slot);
          return (
            <div key={slot} className="row between" style={{ padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8, background: current === slot && hasGame ? '#1a2330' : undefined }}>
              <div>
                <div className="bold">{slot.replace('slot', 'Slot ')}{current === slot && hasGame ? <span className="tiny muted"> · current</span> : ''}</div>
                {m ? <div className="small muted">{m.club} · {m.manager} · {m.season} · {formatDay(m.day)} · saved {new Date(m.savedAt).toLocaleString()}</div> : <div className="small dim">Empty</div>}
              </div>
              <div className="row gap4">
                {mode === 'save' && <button className="btn sm primary" disabled={busy} onClick={async () => { await save(slot); await refresh(); showToast(`Saved to ${slot.replace('slot', 'slot ')}`); }}>{m ? 'Overwrite' : 'Save here'}</button>}
                {mode === 'load' && m && <button className="btn sm primary" disabled={busy} onClick={async () => { setBusy(true); const ok = await load(slot); setBusy(false); if (ok) onClose(); else showToast('Could not load this slot'); }}>Load</button>}
                {m && <button className="btn sm danger" disabled={busy} onClick={async () => { if (confirm('Delete this save?')) { await deleteSave(slot); await refresh(); } }}>✕</button>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="row gap4 wrap">
        {hasGame && <button className="btn" onClick={doExport}>⬇ Export save to file</button>}
        <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Import save from file</button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
        <div className="grow" />
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
      <div className="tiny dim mt8">Games autosave to the current slot whenever the calendar stops. Saves live in this browser; export a file to move a career between devices.</div>
    </Modal>
  );
}
