import { io } from 'socket.io-client';

export const initSocket = async () => {
    const options = {
        'force new connection': true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        upgrade: true,
        rememberUpgrade: true,
        pingTimeout: 60000,
        pingInterval: 25000,
    };
    
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
    return io(backendUrl, options);
};
