import http from 'node:http';
import {serveStatic} from './static-server.mjs';
http.createServer(serveStatic).listen(8000,'127.0.0.1',()=>console.log('Digmori: http://127.0.0.1:8000/bloom-digmori/ (no build)'));
