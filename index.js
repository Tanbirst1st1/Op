import fs from 'fs';
import path from 'path';
import os from 'os';
import formidable from 'formidable';
import fetch from 'node-fetch';

export const config = {
  api: {
    bodyParser: false,
  },
};

const botToken = '8070278061:AAFsmX5YDzzfWjDwnIEWqicDGuebz25Ecvc';
const dataFilePath = path.join(process.cwd(), 'data.json');
const userId = 'YOUR_TELEGRAM_USER_ID'; // Replace with your own Telegram user ID

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const form = new formidable.IncomingForm({ uploadDir: os.tmpdir(), keepExtensions: true });

    form.parse(req, async (err, fields, files) => {
      if (err) return res.status(500).json({ error: 'Upload error' });

      const file = files.file;
      const filePath = file[0].filepath;
      const fileStream = fs.createReadStream(filePath);

      const telegramUrl = `https://api.telegram.org/bot${botToken}/sendDocument`;

      const formData = new FormData();
      formData.append('chat_id', userId);
      formData.append('document', fileStream, file[0].originalFilename);

      try {
        const telegramRes = await fetch(telegramUrl, { method: 'POST', body: formData });
        const telegramData = await telegramRes.json();

        const prevData = fs.existsSync(dataFilePath) ? JSON.parse(fs.readFileSync(dataFilePath)) : [];
        prevData.push(telegramData);
        fs.writeFileSync(dataFilePath, JSON.stringify(prevData, null, 2));

        fs.unlinkSync(filePath);

        res.writeHead(302, { Location: '/' });
        res.end();
      } catch (error) {
        res.status(500).json({ error: 'Failed to send to Telegram' });
      }
    });
  } else {
    const fileList = fs.existsSync(dataFilePath) ? JSON.parse(fs.readFileSync(dataFilePath)) : [];

    const fileListHtml = fileList.map((item, i) => {
      const file = item.result?.document;
      return `<li>#${i + 1} - ${file?.file_name || 'Unknown'} - File ID: ${file?.file_id}</li>`;
    }).join('');

    res.setHeader('Content-Type', 'text/html');
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Upload to Telegram Bot</title>
  <style>
    body { background:#111; color:#fff; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; padding:20px }
    h1 { color: red }
    form { margin:20px; border:2px solid red; padding:20px; border-radius:10px; }
    input[type=file] { padding:10px; background:#222; border:1px solid #444; color:#fff }
    button { margin-top:10px; padding:10px 20px; background:red; color:#fff; border:none; cursor:pointer }
    ul { list-style:none; padding:0; max-width:90%; margin-top:20px; }
    li { margin:10px 0; background:#222; padding:10px; border-radius:5px }
    @media(max-width:600px){ h1{font-size:1.5em;} form{width:90%;} }
  </style>
</head>
<body>
  <h1>Upload File to Telegram Bot</h1>
  <form method="POST" enctype="multipart/form-data">
    <input type="file" name="file" required>
    <br>
    <button type="submit">Upload</button>
  </form>

  <h2>Uploaded Files</h2>
  <ul>${fileListHtml || '<li>No files uploaded yet.</li>'}</ul>
</body>
</html>`);
  }
}
