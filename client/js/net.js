// Connection to the game server (Socket.io).
import { io } from '/socket.io/socket.io.esm.min.js';

export function connect() {
  const socket = io({ transports: ['websocket', 'polling'] });
  // The server pings us to measure lag; just answer.
  socket.on('latency', (ack) => { if (typeof ack === 'function') ack(); });
  return socket;
}

/** Ask the server to create a room. Resolves to the welcome info, or throws an Error. */
export function createRoom(socket, name, loadout = {}) {
  return request(socket, 'create', { name, ...loadout });
}

export function joinRoom(socket, code, name, loadout = {}) {
  return request(socket, 'join', { code, name, ...loadout });
}

function request(socket, event, data) {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, data, (err, res) => {
      if (err) return reject(new Error('Server did not answer. Is it running?'));
      if (!res.ok) return reject(new Error(res.error));
      resolve(res.welcome);
    });
  });
}
