'use client';

import { useState } from 'react';

interface Props {
  title: string;
  content: string;
  sopKey: string;
}

const AMBER = [224, 123, 57] as [number, number, number];
const SLATE_900 = [15, 23, 42] as [number, number, number];
const SLATE_600 = [71, 85, 105] as [number, number, number];
const SLATE_300 = [203, 213, 225] as [number, number, number];
const WHITE = [255, 255, 255] as [number, number, number];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_L = 18;
const MARGIN_R = 18;
const MARGIN_T = 24;
const MARGIN_B = 20;
const TEXT_W = PAGE_W - MARGIN_L - MARGIN_R;

function setColor(doc: InstanceType<typeof import('jspdf').jsPDF>, rgb: [number, number, number], which: 'fill' | 'text' | 'draw') {
  if (which === 'fill') doc.setFillColor(...rgb);
  else if (which === 'text') doc.setTextColor(...rgb);
  else doc.setDrawColor(...rgb);
}

export default function SOPPdfButton({ title, content, sopKey }: Props) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      let pageNum = 1;
      let y = MARGIN_T;

      const addPage = () => {
        // Footer on current page
        drawFooter(doc, pageNum, title);
        doc.addPage();
        pageNum++;
        y = MARGIN_T;
        drawHeader(doc);
      };

      const ensureSpace = (needed: number) => {
        if (y + needed > PAGE_H - MARGIN_B - 10) addPage();
      };

      const drawHeader = (d: InstanceType<typeof import('jspdf').jsPDF>) => {
        setColor(d, AMBER, 'fill');
        d.rect(0, 0, PAGE_W, 8, 'F');
        setColor(d, SLATE_900, 'fill');
        d.rect(0, 8, PAGE_W, 0.3, 'F');
      };

      const drawFooter = (d: InstanceType<typeof import('jspdf').jsPDF>, pn: number, docTitle: string) => {
        setColor(d, SLATE_300, 'draw');
        d.setLineWidth(0.2);
        d.line(MARGIN_L, PAGE_H - MARGIN_B, PAGE_W - MARGIN_R, PAGE_H - MARGIN_B);
        setColor(d, SLATE_600, 'text');
        d.setFontSize(7);
        d.setFont('helvetica', 'normal');
        d.text('Sunline Solar Agency', MARGIN_L, PAGE_H - MARGIN_B + 4);
        d.text(docTitle, PAGE_W / 2, PAGE_H - MARGIN_B + 4, { align: 'center' });
        d.text(`Page ${pn}`, PAGE_W - MARGIN_R, PAGE_H - MARGIN_B + 4, { align: 'right' });
      };

      // ---------- Cover page ----------
      // Amber header bar
      setColor(doc, AMBER, 'fill');
      doc.rect(0, 0, PAGE_W, 60, 'F');

      // Sunline wordmark on cover
      setColor(doc, WHITE, 'text');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('SUNLINE', MARGIN_L, 22);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Solar Agency', MARGIN_L, 28);

      // Cover title
      setColor(doc, WHITE, 'text');
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      const titleLines = doc.splitTextToSize(title, TEXT_W);
      titleLines.forEach((line: string, i: number) => {
        doc.text(line, MARGIN_L, 46 + i * 9);
      });

      // Below cover amber
      y = 80;
      setColor(doc, SLATE_600, 'text');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Sunline Solar Agency  ·  Version 1.0  ·  ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, MARGIN_L, y);
      y += 5;
      doc.text('Owner-editable. Distribute to relevant team members only.', MARGIN_L, y);
      y += 16;
      setColor(doc, AMBER, 'draw');
      doc.setLineWidth(0.4);
      doc.line(MARGIN_L, y, PAGE_W - MARGIN_R, y);
      y += 12;

      // Footer on cover
      drawFooter(doc, pageNum, title);

      // ---------- Content pages ----------
      doc.addPage();
      pageNum++;
      y = MARGIN_T;
      drawHeader(doc);
      y = 14;

      const lines = content.split('\n');
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith('# ')) {
          ensureSpace(16);
          if (y > 16) {
            setColor(doc, AMBER, 'fill');
            doc.rect(MARGIN_L, y - 1, TEXT_W, 10, 'F');
            setColor(doc, WHITE, 'text');
            doc.setFontSize(13);
            doc.setFont('helvetica', 'bold');
            doc.text(line.slice(2), MARGIN_L + 3, y + 6);
            y += 14;
          }
        } else if (line.startsWith('## ')) {
          ensureSpace(14);
          y += 4;
          setColor(doc, SLATE_900, 'text');
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.text(line.slice(3), MARGIN_L, y);
          setColor(doc, AMBER, 'draw');
          doc.setLineWidth(0.5);
          doc.line(MARGIN_L, y + 1.5, PAGE_W - MARGIN_R, y + 1.5);
          y += 7;
        } else if (line.startsWith('### ')) {
          ensureSpace(10);
          y += 2;
          setColor(doc, SLATE_900, 'text');
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(line.slice(4), MARGIN_L, y);
          y += 6;
        } else if (line.startsWith('| ') && !line.startsWith('|---')) {
          // Table — collect all rows
          const tableLines: string[] = [];
          while (i < lines.length && lines[i].startsWith('|')) {
            if (!lines[i].startsWith('|---')) tableLines.push(lines[i]);
            i++;
          }
          const headers = tableLines[0].split('|').filter(Boolean).map(h => h.trim());
          const rows = tableLines.slice(1).map(r => r.split('|').filter(Boolean).map(c => c.trim()));
          const colW = TEXT_W / headers.length;

          ensureSpace(8 + rows.length * 6);

          // Header row
          setColor(doc, SLATE_900, 'fill');
          doc.rect(MARGIN_L, y, TEXT_W, 7, 'F');
          setColor(doc, WHITE, 'text');
          doc.setFontSize(7.5);
          doc.setFont('helvetica', 'bold');
          headers.forEach((h, j) => {
            doc.text(h.toUpperCase(), MARGIN_L + j * colW + 2, y + 4.8);
          });
          y += 7;

          // Data rows
          rows.forEach((row, ri) => {
            const rowLines = row.map(cell => doc.splitTextToSize(stripMarkdown(cell), colW - 4));
            const rowH = Math.max(...rowLines.map((ls: string[]) => ls.length)) * 4 + 3;

            if (y + rowH > PAGE_H - MARGIN_B - 10) {
              addPage();
              drawHeader(doc);
              y = 14;
            }

            setColor(doc, ri % 2 === 0 ? ([248, 250, 252] as [number,number,number]) : WHITE, 'fill');
            doc.rect(MARGIN_L, y, TEXT_W, rowH, 'F');
            setColor(doc, SLATE_600, 'text');
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            row.forEach((cell, j) => {
              const cellLines = doc.splitTextToSize(stripMarkdown(cell), colW - 4);
              cellLines.forEach((cl: string, li: number) => {
                doc.text(cl, MARGIN_L + j * colW + 2, y + 3.5 + li * 4);
              });
            });
            // Border
            setColor(doc, SLATE_300, 'draw');
            doc.setLineWidth(0.1);
            doc.rect(MARGIN_L, y, TEXT_W, rowH);
            y += rowH;
          });
          y += 4;
          continue;
        } else if (line.startsWith('> ')) {
          ensureSpace(10);
          setColor(doc, AMBER, 'fill');
          const qText = doc.splitTextToSize(line.slice(2), TEXT_W - 8);
          const qH = qText.length * 4.5 + 4;
          doc.rect(MARGIN_L, y - 1, 2, qH, 'F');
          setColor(doc, [254, 243, 199] as [number,number,number], 'fill');
          doc.rect(MARGIN_L + 2, y - 1, TEXT_W - 2, qH, 'F');
          setColor(doc, [146, 64, 14] as [number,number,number], 'text');
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'italic');
          qText.forEach((ql: string, qi: number) => {
            doc.text(ql, MARGIN_L + 5, y + 2.5 + qi * 4.5);
          });
          y += qH + 3;
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          const bullet = stripMarkdown(line.slice(2));
          ensureSpace(6);
          setColor(doc, AMBER, 'fill');
          doc.circle(MARGIN_L + 2, y - 0.5, 0.9, 'F');
          setColor(doc, SLATE_600, 'text');
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          const bLines = doc.splitTextToSize(bullet, TEXT_W - 6);
          bLines.forEach((bl: string, bi: number) => {
            doc.text(bl, MARGIN_L + 6, y + bi * 4.5);
          });
          y += bLines.length * 4.5 + 1;
        } else if (/^\d+\. /.test(line)) {
          const num = line.match(/^(\d+)\. /)?.[1] ?? '•';
          const text = stripMarkdown(line.replace(/^\d+\. /, ''));
          ensureSpace(6);
          setColor(doc, AMBER, 'text');
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'bold');
          doc.text(num + '.', MARGIN_L, y);
          setColor(doc, SLATE_600, 'text');
          doc.setFont('helvetica', 'normal');
          const nLines = doc.splitTextToSize(text, TEXT_W - 8);
          nLines.forEach((nl: string, ni: number) => {
            doc.text(nl, MARGIN_L + 7, y + ni * 4.5);
          });
          y += nLines.length * 4.5 + 1;
        } else if (line.startsWith('```')) {
          const codeLines: string[] = [];
          i++;
          while (i < lines.length && !lines[i].startsWith('```')) {
            codeLines.push(lines[i]);
            i++;
          }
          const codeH = codeLines.length * 4 + 6;
          ensureSpace(codeH);
          setColor(doc, [30, 41, 59] as [number,number,number], 'fill');
          doc.rect(MARGIN_L, y - 2, TEXT_W, codeH, 'F');
          setColor(doc, [148, 163, 184] as [number,number,number], 'text');
          doc.setFontSize(6.5);
          doc.setFont('courier', 'normal');
          codeLines.forEach((cl, ci) => {
            doc.text(cl, MARGIN_L + 3, y + 1 + ci * 4);
          });
          doc.setFont('helvetica', 'normal');
          y += codeH + 3;
        } else if (line === '---') {
          ensureSpace(6);
          setColor(doc, SLATE_300, 'draw');
          doc.setLineWidth(0.2);
          doc.line(MARGIN_L, y + 2, PAGE_W - MARGIN_R, y + 2);
          y += 6;
        } else if (line.trim() === '' || line.startsWith('_')) {
          y += 2;
        } else {
          const plain = stripMarkdown(line);
          if (!plain.trim()) { i++; continue; }
          ensureSpace(8);
          setColor(doc, SLATE_600, 'text');
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          const pLines = doc.splitTextToSize(plain, TEXT_W);
          pLines.forEach((pl: string, pi: number) => {
            doc.text(pl, MARGIN_L, y + pi * 4.5);
          });
          y += pLines.length * 4.5 + 2;
        }

        i++;
      }

      drawFooter(doc, pageNum, title);

      const slug = sopKey.replace(/[^a-z0-9]+/g, '-');
      doc.save(`sunline-${slug}-sop.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={generating}
      className="px-4 py-2 border border-slate-200 hover:border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      </svg>
      {generating ? 'Generating…' : 'Download PDF'}
    </button>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
