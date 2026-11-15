// The only place that opens PDF files (pdf-lib for form fields,
// pdf-parse for raw text).
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');

// Returns [{ name, value, type }]. Empty array if the PDF has no
// readable form fields (flattened/scanned, or not parseable as a form).
async function readFormFields(buffer) {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    return form.getFields().map((f) => {
      const name = f.getName();
      const type = f.constructor && f.constructor.name === 'PDFCheckBox' ? 'checkbox' : 'text';
      let value = '';
      try {
        value = type === 'checkbox' ? f.isChecked() : f.getText();
      } catch {
        value = '';
      }
      return { name, value, type };
    });
  } catch (err) {
    console.warn('PDF has no readable form fields, falling back to raw text:', err.message);
    return [];
  }
}

async function readText(buffer) {
  const parsed = await pdfParse(buffer);
  return parsed.text;
}

module.exports = { readFormFields, readText };
