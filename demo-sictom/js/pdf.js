/* Génération PDF côté navigateur — pdf-lib (window.PDFLib) */
'use strict';

async function buildConventionPdf(convId) {
  const c = await Store.getConvention(convId);
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const draw = (text, x, y, size, f, color) => {
    page.drawText(String(text == null ? '' : text), { x: x, y: y, size: size || 10, font: f || font, color: color || rgb(0.1, 0.12, 0.15) });
  };
  const fr = (s) => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString('fr-FR'); };

  page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: rgb(0.10, 0.30, 0.34) });
  page.drawRectangle({ x: 0, y: 772, width: 8, height: 70, color: rgb(0.58, 0.34, 0.11) });
  draw('SICTOM', 40, 812, 22, bold, rgb(1, 1, 1));
  draw('Conventions de mise à disposition de conteneurs', 40, 792, 11, font, rgb(0.9, 0.95, 0.96));
  draw(c.reference, 480, 805, 14, bold, rgb(1, 1, 1));

  let y = 735;
  draw('SYNTHÈSE', 40, y, 12, bold); y -= 8;
  page.drawLine({ start: { x: 40, y: y }, end: { x: 555, y: y }, thickness: 1, color: rgb(0.58, 0.34, 0.11) });
  y -= 20;
  const rows = [
    ['Titulaire (commune)', c.commune_name],
    ['Objet', c.objet],
    ['Lieu', c.lieu || '—'],
    ['Parcours / service', c.parcours || '—'],
    ['Période', fr(c.date_debut) + ' à ' + fr(c.date_fin)],
    ['Contact', (c.contact_name || '—') + (c.contact_email ? ' (' + c.contact_email + ')' : '')],
    ['Statut', (c.statut || '').toUpperCase()],
  ];
  rows.forEach((r) => {
    draw(r[0], 40, y, 10, bold);
    draw(String(r[1]).slice(0, 75), 200, y, 10);
    y -= 18;
  });

  y -= 12;
  draw('CONTENEURS OBJECTIF', 40, y, 12, bold); y -= 8;
  page.drawLine({ start: { x: 40, y: y }, end: { x: 555, y: y }, thickness: 1, color: rgb(0.58, 0.34, 0.11) });
  y -= 18;
  page.drawRectangle({ x: 40, y: y - 4, width: 515, height: 18, color: rgb(0.93, 0.94, 0.95) });
  draw('Type', 50, y, 10, bold); draw('Code', 300, y, 10, bold); draw('Volume', 380, y, 10, bold); draw('Quantité', 480, y, 10, bold);
  y -= 18;
  c.lignes.forEach((l) => {
    draw(l.label, 50, y); draw(l.code, 300, y); draw(l.volume_l + ' L', 385, y); draw(String(l.quantite), 490, y);
    y -= 16;
  });

  y -= 12;
  draw('CONTENEURS AFFECTÉS (' + c.bacs.length + ')', 40, y, 12, bold); y -= 8;
  page.drawLine({ start: { x: 40, y: y }, end: { x: 555, y: y }, thickness: 1, color: rgb(0.58, 0.34, 0.11) });
  y -= 18;
  c.bacs.slice(0, 12).forEach((b) => {
    draw(b.serial, 50, y); draw(b.type_label, 150, y);
    draw(b.rfid ? 'RFID ' + b.rfid : 'RFID non affectée', 320, y);
    y -= 16;
  });
  if (!c.bacs.length) { draw('Aucun conteneur affecté à ce jour.', 50, y); y -= 16; }

  y = 150;
  page.drawLine({ start: { x: 40, y: y + 30 }, end: { x: 555, y: y + 30 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.75) });
  draw('SIGNATURE ÉLECTRONIQUE DU TITULAIRE', 40, y, 11, bold);
  y -= 16;
  if (c.signature_png) {
    try {
      const b64 = String(c.signature_png).split(',')[1] || '';
      const png = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const img = await pdf.embedPng(png);
      page.drawImage(img, { x: 40, y: y - 90, width: 200, height: 80 });
    } catch (e) { /* png invalide */ }
  }
  draw('Signataire : ' + (c.signature_name || '—'), 280, y);
  draw('Qualité : ' + (c.signature_role || '—'), 280, y - 14);
  draw('Date : ' + (c.signature_date ? fr(c.signature_date) : '—'), 280, y - 28);

  draw('Document généré par la démo SICTOM — Conventions MAD', 40, 40, 8, font, rgb(0.45, 0.47, 0.5));
  draw(new Date().toLocaleString('fr-FR'), 470, 40, 8, font, rgb(0.45, 0.47, 0.5));

  return pdf.save();
}
