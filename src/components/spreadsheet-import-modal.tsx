"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";

type SpreadsheetImportModalProps = {
  open: boolean;
  title: string;
  description: string;
  formatDescription: string;
  formatHint: string;
  onTemplate: () => Promise<void>;
  onImport: (file: File) => Promise<string>;
  onClose: () => void;
};

export function SpreadsheetImportModal({
  open,
  title,
  description,
  formatDescription,
  formatHint,
  onTemplate,
  onImport,
  onClose,
}: SpreadsheetImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);

  if (!open) return null;

  async function importFile() {
    if (!file) {
      setError("Selecione uma planilha para importar.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("O arquivo excede o limite de 10 MB.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Arquivo inválido.");
      setBusy(false);
      return;
    }
    try {
      setMessage(await onImport(file));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (cause) {
      console.error(`Falha ao importar ${title.toLowerCase()}.`, cause);
      setError(cause instanceof Error ? cause.message : `Não foi possível importar ${title.toLowerCase()}.`);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setTemplateBusy(true);
    setError("");
    try {
      await onTemplate();
    } catch (cause) {
      console.error("Falha ao baixar o template da planilha.", cause);
      setError(cause instanceof Error ? cause.message : "Não foi possível baixar o template.");
    } finally {
      setTemplateBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <section className="customer-modal spreadsheet-import-modal" role="dialog" aria-modal="true" aria-labelledby="spreadsheet-import-title">
        <div className="modal-heading">
          <div className="spreadsheet-modal-title">
            <span className="spreadsheet-modal-icon"><FileSpreadsheet size={21} /></span>
            <span><h2 id="spreadsheet-import-title">{title}</h2><p>{description}</p></span>
          </div>
          <button className="icon-button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20} /></button>
        </div>
        <div className="spreadsheet-import-body">
          <label className={`spreadsheet-dropzone ${busy ? "spreadsheet-dropzone-disabled" : ""}`}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={busy}
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0] ?? null;
                setFile(selected);
                setError(selected && selected.size > 10 * 1024 * 1024 ? "O arquivo excede o limite de 10 MB." : "");
                setMessage("");
              }}
            />
            <span className="spreadsheet-upload-icon"><Upload size={20} /></span>
            <span><strong>{file?.name ?? "Selecionar planilha"}</strong><small>{file ? `${(file.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB` : formatDescription}</small></span>
          </label>
          <div className="spreadsheet-format-row">
            <div><strong>Formato esperado</strong><p>{formatHint}</p></div>
            <button className="button button-outline spreadsheet-template-button" disabled={busy || templateBusy} onClick={() => { void downloadTemplate(); }}><Download size={15} /> {templateBusy ? "Gerando..." : "Template"}</button>
          </div>
          {error && <p className="form-error spreadsheet-import-message" role="alert">{error}</p>}
          {message && <p className="import-feedback feedback-success spreadsheet-import-message" role="status">{message}</p>}
        </div>
        <div className="modal-footer spreadsheet-import-footer">
          <button className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button>
          <button className="button button-primary" disabled={busy || !file || file.size > 10 * 1024 * 1024} onClick={() => { void importFile(); }}><Upload size={15} /> {busy ? "Importando..." : `Importar ${title.replace(/^Importar\s+/i, "").toLowerCase()}`}</button>
        </div>
      </section>
    </div>
  );
}
