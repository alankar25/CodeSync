import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import { initSocket } from '../socket';
import {
    useLocation,
    useNavigate,
    Navigate,
    useParams,
} from 'react-router-dom';

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);

    const handleSocketEvents = () => {
        if (!socketRef.current) return;

        // Connection events
        socketRef.current.on('connect', () => {
            console.log('Socket connected:', socketRef.current.id);
            setIsConnected(true);
            setIsReconnecting(false);
            toast.success('Connected to room!');
            
            // Re-join room after reconnection
            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });
        });

        socketRef.current.on('disconnect', (reason) => {
            console.log('Socket disconnected:', reason);
            setIsConnected(false);
            
            if (reason === 'io server disconnect') {
                // Server disconnected us, try to reconnect
                socketRef.current.connect();
            }
        });

        socketRef.current.on('reconnect', (attemptNumber) => {
            console.log('Socket reconnected after', attemptNumber, 'attempts');
            setIsConnected(true);
            setIsReconnecting(false);
            toast.success('Reconnected to room!');
        });

        socketRef.current.on('reconnect_attempt', (attemptNumber) => {
            console.log('Reconnection attempt:', attemptNumber);
            setIsReconnecting(true);
            toast.loading(`Reconnecting... (Attempt ${attemptNumber})`);
        });

        socketRef.current.on('reconnect_failed', () => {
            console.log('Reconnection failed');
            setIsReconnecting(false);
            toast.error('Failed to reconnect. Please refresh the page.');
        });

        // Error events
        socketRef.current.on('connect_error', (err) => {
            console.log('Socket connection error:', err);
            setIsConnected(false);
            toast.error('Connection failed. Trying to reconnect...');
        });

        socketRef.current.on('connect_failed', (err) => {
            console.log('Socket connection failed:', err);
            setIsConnected(false);
            toast.error('Connection failed. Please check your internet connection.');
        });

        // Room events
        socketRef.current.on(ACTIONS.JOINED, ({ clients, username, socketId }) => {
            if (username !== location.state?.username) {
                toast.success(`${username} joined the room.`);
                console.log(`${username} joined`);
            }
            setClients(clients);
            socketRef.current.emit(ACTIONS.SYNC_CODE, {
                code: codeRef.current,
                socketId,
            });
        });

        socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
            toast.success(`${username} left the room.`);
            setClients((prev) => {
                return prev.filter((client) => client.socketId !== socketId);
            });
        });

        // Heartbeat handling
        socketRef.current.on('ping', () => {
            socketRef.current.emit('pong');
        });
    };

    useEffect(() => {
        const init = async () => {
            try {
                socketRef.current = await initSocket();
                handleSocketEvents();
            } catch (error) {
                console.error('Failed to initialize socket:', error);
                toast.error('Failed to connect to server. Please try again.');
                reactNavigator('/');
            }
        };
        
        init();
        
        return () => {
            if (socketRef.current) {
                socketRef.current.off('connect');
                socketRef.current.off('disconnect');
                socketRef.current.off('reconnect');
                socketRef.current.off('reconnect_attempt');
                socketRef.current.off('reconnect_failed');
                socketRef.current.off('connect_error');
                socketRef.current.off('connect_failed');
                socketRef.current.off(ACTIONS.JOINED);
                socketRef.current.off(ACTIONS.DISCONNECTED);
                socketRef.current.disconnect();
            }
        };
    }, []);

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to your clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    const handleManualReconnect = async () => {
        if (socketRef.current) {
            socketRef.current.disconnect();
        }
        
        try {
            socketRef.current = await initSocket();
            handleSocketEvents();
            toast.success('Attempting to reconnect...');
        } catch (error) {
            console.error('Manual reconnection failed:', error);
            toast.error('Failed to reconnect. Please refresh the page.');
        }
    };

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img
                            className="logoImage"
                            src="/code-sync.png"
                            alt="logo"
                        />
                    </div>
                    <h3>Connected</h3>
                    <div className="clientsList">
                        {clients.map((client) => (
                            <Client
                                key={client.socketId}
                                username={client.username}
                            />
                        ))}
                    </div>
                </div>
                <div className="connectionStatus">
                    <div className={`statusIndicator ${isConnected ? 'connected' : 'disconnected'}`}>
                        {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
                    </div>
                    {isReconnecting && (
                        <div className="reconnectingIndicator">
                            🔄 Reconnecting...
                        </div>
                    )}
                    {!isConnected && !isReconnecting && (
                        <button 
                            className="btn reconnectBtn" 
                            onClick={handleManualReconnect}
                            style={{ marginTop: '10px', width: '100%' }}
                        >
                            🔄 Reconnect
                        </button>
                    )}
                </div>
                <button className="btn copyBtn" onClick={copyRoomId}>
                    Copy ROOM ID
                </button>
                <button className="btn leaveBtn" onClick={leaveRoom}>
                    Leave
                </button>
            </div>
            <div className="editorWrap">
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                />
            </div>
        </div>
    );
};

export default EditorPage;
