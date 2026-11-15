const express = require('express');
const multer = require('multer');
const { MAX_PDF_BYTES } = require('../../../config');
const characters = require('../../characters/service');
const { mapPdfFormFields } = require('./mapper');
const { readFormFields, readText } = require('./reader');

// POST /api/import/pdf  (multipart field "file")
function createPdfRouter({ onCharactersChanged }) {
  const router = express.Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PDF_BYTES },
  });

  router.post('/', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    try {
      const fields = await readFormFields(req.file.buffer);

      if (fields.length > 0) {
        const { patch, leftover } = mapPdfFormFields(fields);
        const notesPrefix = 'Imported from a PDF form. Please double-check everything below.'
          + (leftover ? `\n\nOther fields found in the PDF that weren't auto-mapped:\n${leftover}` : '');
        const ch = characters.addImported(patch, notesPrefix);
        onCharactersChanged();
        return res.json({ character: ch, warning: 'Some fields may need manual review.' });
      }

      // No form fields at all — likely a flattened/scanned PDF. Fall
      // back to raw text extraction so at least something comes across.
      const text = await readText(req.file.buffer);
      const notesPrefix = 'Imported from a PDF with no fillable form fields, so nothing could be auto-mapped. '
        + "Here's the raw text Claude extracted — copy what you need into the fields above:\n\n" + text.slice(0, 3500);
      const ch = characters.addImported({}, notesPrefix);
      onCharactersChanged();
      res.json({ character: ch, warning: 'No fillable fields found — pasted raw text into Notes instead.' });
    } catch (err) {
      console.error('PDF import failed:', err);
      res.status(500).json({ error: 'Could not read that PDF.' });
    }
  });

  return router;
}

module.exports = { createPdfRouter };
