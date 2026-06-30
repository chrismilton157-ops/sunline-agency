'use client';

import { useState, useCallback, useTransition } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { saveSOPContent, resetSOPContent } from './actions';

const SOPPdfButton = dynamic(() => import('./pdf-client'), { ssr: false });

interface Props {
  id: string;
  sopKey: string;
  title: string;
  content: string;
  defaultContent: string;
  updatedAt: string;
}

export function SOPEditor({ id, sopKey, title, content: initialContent, defaultContent, updatedAt }: Props) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [lastSaved, setLastSaved] = useState(updatedAt);
  const [isPending, startTransition] = useTransition();
  const [saveMsg, setSaveMsg] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const isDirty = content !== savedContent;

  const handleSave = useCallback(() => {
    startTransition(async () => {
      const result = await saveSOPContent(id, content);
      if (result.ok) {
        setSavedContent(content);
        setLastSaved(result.updatedAt ?? lastSaved);
        setMode('view');
        setSaveMsg('Saved');
        setTimeout(() => setSaveMsg(''), 2500);
      } else {
        setSaveMsg('Save failed — try again');
      }
    });
  }, [id, content, lastSaved]);

  const handleReset = useCallback(() => {
    startTransition(async () => {
      const result = await resetSOPContent(id, defaultContent);
      if (result.ok) {
        setContent(defaultContent);
        setSavedContent(defaultContent);
        setLastSaved(result.updatedAt ?? lastSaved);
        setMode('view');
        setShowResetConfirm(false);
        setSaveMsg('Reset to default');
        setTimeout(() => setSaveMsg(''), 2500);
      }
    });
  }, [id, defaultContent, lastSaved]);

  const renderMarkdown = (md: string) => {
    const lines = md.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.startsWith('# ')) {
        elements.push(<h1 key={i} className="text-2xl font-bold text-slate-900 mt-6 mb-3 first:mt-0">{line.slice(2)}</h1>);
      } else if (line.startsWith('## ')) {
        elements.push(<h2 key={i} className="text-lg font-semibold text-slate-800 mt-8 mb-2 border-b border-slate-100 pb-1">{line.slice(3)}</h2>);
      } else if (line.startsWith('### ')) {
        elements.push(<h3 key={i} className="text-base font-semibold text-slate-700 mt-5 mb-1">{line.slice(4)}</h3>);
      } else if (line.startsWith('| ')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        const headers = tableLines[0].split('|').filter(Boolean).map(h => h.trim());
        const rows = tableLines.slice(2).map(r => r.split('|').filter(Boolean).map(c => c.trim()));
        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-4">
            <table className="min-w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  {headers.map((h, j) => (
                    <th key={j} className="text-left px-3 py-2 border border-slate-200 font-semibold text-slate-700 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, j) => (
                  <tr key={j} className={j % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    {row.map((cell, k) => (
                      <td key={k} className="px-3 py-2 border border-slate-200 text-slate-600 align-top">{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      } else if (line.startsWith('> ')) {
        elements.push(
          <blockquote key={i} className="border-l-4 border-amber-400 pl-4 py-1 my-3 bg-amber-50 rounded-r text-slate-700 italic text-sm">
            {renderInline(line.slice(2))}
          </blockquote>
        );
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        const listItems: string[] = [];
        while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
          listItems.push(lines[i].slice(2));
          i++;
        }
        elements.push(
          <ul key={`ul-${i}`} className="list-disc list-outside ml-5 my-2 space-y-1">
            {listItems.map((item, j) => (
              <li key={j} className="text-slate-600 text-sm leading-relaxed">{renderInline(item)}</li>
            ))}
          </ul>
        );
        continue;
      } else if (/^\d+\. /.test(line)) {
        const listItems: string[] = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          listItems.push(lines[i].replace(/^\d+\. /, ''));
          i++;
        }
        elements.push(
          <ol key={`ol-${i}`} className="list-decimal list-outside ml-5 my-2 space-y-1">
            {listItems.map((item, j) => (
              <li key={j} className="text-slate-600 text-sm leading-relaxed">{renderInline(item)}</li>
            ))}
          </ol>
        );
        continue;
      } else if (line.startsWith('```')) {
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        elements.push(
          <pre key={`code-${i}`} className="bg-slate-900 text-slate-100 rounded-lg p-4 my-4 overflow-x-auto text-xs font-mono leading-relaxed">
            {codeLines.join('\n')}
          </pre>
        );
      } else if (line === '---') {
        elements.push(<hr key={i} className="border-slate-200 my-6" />);
      } else if (line.trim() === '') {
        // skip blank lines
      } else {
        elements.push(<p key={i} className="text-slate-600 text-sm leading-relaxed my-2">{renderInline(line)}</p>);
      }
      i++;
    }
    return elements;
  };

  const renderInline = (text: string): React.ReactNode => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="bg-slate-100 text-slate-700 px-1 py-0.5 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i} className="italic text-slate-500">{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <Link href="/sops" className="text-xs text-slate-400 hover:text-slate-600 mb-1 block">← SOPs &amp; Playbooks</Link>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <div className="text-xs text-slate-400 mt-0.5">
            Last saved {new Date(lastSaved).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {saveMsg && <span className={`ml-3 font-medium ${saveMsg.includes('failed') ? 'text-red-500' : 'text-emerald-600'}`}>{saveMsg}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {mode === 'view' ? (
            <>
              <SOPPdfButton title={title} content={savedContent} sopKey={sopKey} />
              <button
                onClick={() => setMode('edit')}
                className="px-4 py-2 border text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                style={{ borderColor: '#E07B39', backgroundColor: '#E07B39', color: '#ffffff' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                Edit
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setContent(savedContent); setMode('view'); }}
                className="px-3 py-2 text-slate-500 hover:text-slate-700 text-sm border border-slate-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-2 text-slate-500 hover:text-slate-700 text-sm border border-slate-200 rounded-lg"
              >
                Reset to default
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || !isDirty}
                className="px-4 py-2 border text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-40"
                style={{ borderColor: '#E07B39', backgroundColor: '#E07B39', color: '#ffffff' }}
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reset confirm */}
      {showResetConfirm && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between gap-4">
          <div className="text-sm text-red-700">Reset this document to its original content? Your edits will be lost.</div>
          <div className="flex gap-2">
            <button onClick={() => setShowResetConfirm(false)} className="px-3 py-1.5 text-sm border border-red-200 rounded-lg text-red-600">Cancel</button>
            <button onClick={handleReset} disabled={isPending} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-40">
              {isPending ? 'Resetting…' : 'Yes, reset'}
            </button>
          </div>
        </div>
      )}

      {/* Document */}
      {mode === 'view' ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
          <article className="prose-sunline">
            {renderMarkdown(savedContent)}
          </article>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Editing in Markdown — headings (#, ##, ###), bold (**text**), lists (- item), tables</span>
            <span className={`text-xs ${isDirty ? 'text-amber' : 'text-slate-300'}`}>{isDirty ? 'Unsaved changes' : 'No changes'}</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-[600px] p-6 font-mono text-sm text-slate-700 resize-y focus:outline-none rounded-b-xl"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  );
}
