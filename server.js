const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'font/eot',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.odt': 'application/vnd.oasis.opendocument.text'
};

http.createServer((req, res) => {
    // Extract only the pathname to strip query parameters (e.g. ?v=1)
    const parsedUrl = new URL(req.url, 'http://localhost');
    let urlPath = decodeURIComponent(parsedUrl.pathname);
    
    const baseDir = path.resolve(__dirname);
    let filePath = path.resolve(path.join(baseDir, urlPath === '/' ? 'index.html' : urlPath));

    // Prevent directory traversal attacks
    if (!filePath.startsWith(baseDir + path.sep) && filePath !== baseDir) {
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<h1>403 Forbidden</h1>');
        return;
    }

    fs.stat(filePath, (error, stats) => {
        if (error || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 File Not Found</h1>');
            return;
        }

        const extname = String(path.extname(filePath)).toLowerCase();
        const contentType = MIME_TYPES[extname] || 'application/octet-stream';

        res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        // Use streaming to avoid buffering full files in memory
        const stream = fs.createReadStream(filePath);
        stream.on('error', (streamError) => {
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>500 Internal Server Error</h1><p>${streamError.code}</p>`);
            }
        });
        stream.pipe(res);
    });
}).listen(PORT, '127.0.0.1', () => {
    console.log(`World Cup 2026 Simulator HTTP server running at: http://localhost:${PORT}/`);
});
