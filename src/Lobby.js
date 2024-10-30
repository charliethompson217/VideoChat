import React, { useEffect, useRef, useState, useContext } from 'react';
import { ThemeContext } from './App';

export default function Lobby({ curUser }) {
    const { isDarkMode } = useContext(ThemeContext);

    const [usersInLobby, setUsersInLobby] = useState([]);
    const [lobbyChats, setLobbyChats] = useState([]);
    const websocketRef = useRef(null);
    const [connected, setConnected] = useState(false);
    const [chatMessage, setChatMessage] = useState('');

    const localStreamRef = useRef(null);

    const [remoteStreams, setRemoteStreams] = useState({});
    const peerConnections = useRef({});
    const [connectedUsers, setConnectedUsers] = useState([]);
    const [isCalling, setIsCalling] = useState(false);

    const ICE_SERVERS = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ],
    };

    const Video = ({ stream, muted }) => {
        const videoRef = useRef();

        useEffect(() => {
            if (videoRef.current && stream) {
                if (stream.current) {
                    videoRef.current.srcObject = stream.current;
                } else {
                    videoRef.current.srcObject = stream;
                }
            }
        }, [stream]);

        if (!stream) return null;

        return (
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={muted}
                style={{
                    width: '100%',
                    maxWidth: '300px',
                    backgroundColor: '#ddd',
                    borderRadius: '8px',
                }}
            />
        );
    };

    useEffect(() => {
        const initializeWebSocket = () => {
            console.log('initializeWebSocket');
            const wsUrl = 'wss://0rnrzt4gya.execute-api.us-east-2.amazonaws.com/dev/';
            websocketRef.current = new WebSocket(wsUrl);
        };

        initializeWebSocket();

        const handleWebSocketOpen = () => {
            console.log('handleWebSocketOpen');
            setConnected(true);
            sendMessage({
                type: 'join',
                user: curUser,
            });
        };

        const handleWebSocketMessage = async (event) => {
            const message = JSON.parse(event.data);
            if (message.user && message.user.userId === curUser.userId) {
                return;
            }
            if (message.to && message.to !== curUser.userId && message.to !== 'all') {
                return;
            }
            console.log('handleWebSocketMessage');
            console.log(event);

            switch (message.type) {
                case 'chat':
                    handleChatReceived(message);
                    break;
                case 'join':
                    handleUserJoined(message);
                    break;
                case 'leave':
                    handleUserLeft(message);
                    break;
                case 'call':
                    await handleIncomingCall(message);
                    break;
                case 'accept-call':
                    await handleCallAccepted(message);
                    break;
                case 'reject-call':
                    handleCallRejected(message);
                    break;
                case 'offer':
                    await handleOffer(message);
                    break;
                case 'answer':
                    await handleAnswer(message);
                    break;
                case 'ice-candidate':
                    await handleIceCandidate(message);
                    break;
                case 'presence':
                    handlePresence(message);
                    break;
            }
        };

        websocketRef.current.onopen = handleWebSocketOpen;
        websocketRef.current.onmessage = handleWebSocketMessage;
        websocketRef.current.onclose = () => {
            console.log('websocketRef.current.onclose');
            setConnected(false);
            setTimeout(initializeWebSocket, 3000);
        };

        const presenceInterval = setInterval(() => {
            if (connected) {
                sendMessage({
                    type: 'presence',
                    user: curUser,
                });
            }
        }, 10000);

        const cleanupInterval = setInterval(() => {
            setUsersInLobby((prev) =>
                prev.filter((user) => Date.now() - (user.lastSeen || 0) < 30000)
            );
        }, 10000);

        return () => {
            stopAllCalls();
            if (websocketRef.current) {
                websocketRef.current.close();
            }
        };
    }, [curUser]);

    const startLocalStream = async () => {
        console.log('startLocalStream');
        try {
            if (localStreamRef.current) {
                return localStreamRef.current;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });

            localStreamRef.current = stream;
            return stream;
        } catch (err) {
            console.error('Error accessing media devices:', err);
            alert('Failed to access camera and microphone. Please ensure permissions are granted.');
            throw err;
        }
    };

    const stopLocalStream = () => {
        console.log('stopLocalStream');
        if (localStreamRef) {
            localStreamRef.current.getTracks().forEach(track => {
                track.stop();
            });
            localStreamRef.current = null;
        }
    };

    const callUser = async (userId) => {
        console.log('callUser');
        console.log(userId);
        try {
            setIsCalling(true);

            const stream = await startLocalStream();
            if (!stream) {
                throw new Error('Failed to get local stream');
            }

            sendMessage({
                type: 'call',
                from: curUser.userId,
                to: userId,
                user: curUser,
            });
        } catch (error) {
            console.error('Error starting call:', error);
            setIsCalling(false);
            alert('Failed to start call. Please check your camera and microphone permissions.');
        }
    };


    const handleIncomingCall = async (message) => {
        console.log('handleIncomingCall');
        console.log(message);
        try {
            const { from, user: callerUser } = message;
            const accept = window.confirm(`${callerUser.username} is calling you. Accept?`);

            if (accept) {
                const stream = await startLocalStream();
                if (!stream) {
                    throw new Error('Failed to get local stream');
                }
                sendMessage({
                    type: 'accept-call',
                    from: curUser.userId,
                    to: from,
                    user: curUser,
                });
            } else {
                sendMessage({
                    type: 'reject-call',
                    from: curUser.userId,
                    to: from,
                    user: curUser,
                });
            }
        } catch (error) {
            console.error('Error handling incoming call:', error);
            sendMessage({
                type: 'reject-call',
                from: curUser.userId,
                to: message.from,
                user: curUser,
            });
        }
    };

    const handleCallAccepted = async (message) => {
        console.log('handleCallAccepted');
        console.log(message);
        try {
            const { from } = message;

            if (!localStreamRef.current) {
                await startLocalStream();
            }

            const pc = await createPeerConnection(from);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            console.log('Local description set successfully:', pc.localDescription);

            sendMessage({
                type: 'offer',
                from: curUser.userId,
                to: from,
                offer: pc.localDescription,
            });
        } catch (error) {
            console.error('Error handling call accepted:', error);
            setIsCalling(false);
        }
    };


    const handleCallRejected = (message) => {
        console.log('handleCallRejected');
        console.log(message);
        alert(`${message.user.username} rejected your call.`);
        setIsCalling(false);
        closePeerConnection(message.from);
    };

    const createPeerConnection = async (userId) => {
        console.log('createPeerConnection');
        console.log(userId);
        try {
            if (peerConnections.current[userId]) {
                return peerConnections.current[userId];
            }

            const pc = new RTCPeerConnection(ICE_SERVERS);
            peerConnections.current[userId] = pc;

            if (localStreamRef.current) {
                const stream = localStreamRef.current;
                stream.getTracks().forEach(track => {
                    pc.addTrack(track, stream);
                });
            }

            pc.ontrack = (event) => {
                console.log('pc.ontrack');
                console.log(event);
                setRemoteStreams(prev => ({
                    ...prev,
                    [userId]: event.streams[0]
                }));
            };

            pc.onicecandidate = (event) => {
                console.log('pc.onicecandidate');
                console.log('ICE Candidate:', event.candidate);
                if (event.candidate) {
                    sendMessage({
                        type: 'ice-candidate',
                        from: curUser.userId,
                        to: userId,
                        candidate: event.candidate,
                    });
                }
            };

            pc.oniceconnectionstatechange = () => {
                console.log('pc.oniceconnectionstatechange');
                if (pc.iceConnectionState === 'disconnected' ||
                    pc.iceConnectionState === 'failed' ||
                    pc.iceConnectionState === 'closed') {
                    closePeerConnection(userId);
                }
            };

            setConnectedUsers(prev => [...prev, userId]);
            return pc;
        } catch (error) {
            console.error('Error creating peer connection:', error);
            throw error;
        }
    };


    const handleOffer = async (message) => {
        console.log('handleOffer');
        console.log(message);
        try {
            const { from, offer } = message;

            if (!localStreamRef.current) {
                await startLocalStream();
            }

            const pc = await createPeerConnection(from);

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            sendMessage({
                type: 'answer',
                from: curUser.userId,
                to: from,
                answer: pc.localDescription,
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    };


    const handleAnswer = async (message) => {
        console.log('handleAnswer');
        console.log(message);
        try {
            const { from, answer } = message;
            const pc = peerConnections.current[from];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                setIsCalling(false);
            }
        } catch (error) {
            console.error('Error handling answer:', error);
            setIsCalling(false);
        }
    };

    const handleIceCandidate = async (message) => {
        console.log('handleIceCandidate');
        console.log(message);
        try {
            const { from, candidate } = message;
            const pc = peerConnections.current[from];
            if (pc) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    };

    const closePeerConnection = (userId) => {
        console.log('closePeerConnection');
        console.log(userId);
        const pc = peerConnections.current[userId];
        if (pc) {
            pc.close();
            delete peerConnections.current[userId];
        }

        setRemoteStreams(prev => {
            const updated = { ...prev };
            delete updated[userId];
            return updated;
        });

        setConnectedUsers(prev => prev.filter(id => id !== userId));
        setIsCalling(false);
    };

    const stopAllCalls = () => {
        console.log('stopAllCalls');
        Object.keys(peerConnections.current).forEach(userId => {
            closePeerConnection(userId);
        });
        stopLocalStream();
    };

    const handleUserJoined = (message) => {
        console.log('handleUserJoined');
        console.log(message);
        setUsersInLobby((prev) => {
            if (!prev.some((user) => user.userId === message.user.userId)) {
                return [...prev, { ...message.user, lastSeen: Date.now() }];
            }
            return prev;
        });

        setLobbyChats((prev) => [
            ...prev,
            {
                system: true,
                content: `${message.user.username} joined the lobby`,
                timeStamp: new Date().toISOString(),
            },
        ]);

        if (message.user.userId !== curUser.userId) {
            sendMessage({
                type: 'presence',
                user: curUser,
                to: message.user.userId,
            });
        }
    };

    const handlePresence = (message) => {
        console.log('handlePresence', message);
        setUsersInLobby((prev) => {
            const existingUserIndex = prev.findIndex(
                (user) => user.userId === message.user.userId
            );
            if (existingUserIndex !== -1) {
                const updatedUsers = [...prev];
                updatedUsers[existingUserIndex] = {
                    ...message.user,
                    lastSeen: Date.now(),
                };
                return updatedUsers;
            } else {
                return [...prev, { ...message.user, lastSeen: Date.now() }];
            }
        });
    };

    const handleUserLeft = (message) => {
        console.log('handleUserLeft');
        console.log(message);
        setUsersInLobby(prev =>
            prev.filter(user => user.userId !== message.user.userId)
        );

        setLobbyChats(prev => [
            ...prev,
            {
                system: true,
                content: `${message.user.username} left the lobby`,
                timeStamp: new Date().toISOString(),
            },
        ]);

        closePeerConnection(message.user.userId);
    };

    const handleChatReceived = (message) => {
        console.log('handleChatReceived');
        console.log(message);
        setLobbyChats(prev => [
            ...prev,
            {
                user: message.user.username,
                content: message.content,
                timeStamp: new Date().toISOString(),
            },
        ]);
    };

    const sendMessage = (message) => {
        console.log('sendMessage');
        console.log(message);
        if (websocketRef.current?.readyState === WebSocket.OPEN) {
            websocketRef.current.send(JSON.stringify({
                action: 'message',
                data: message,
            }));
        }
    };

    const sendChatMessage = (e) => {
        console.log('sendChatMessage');
        console.log(e);
        e.preventDefault();
        if (chatMessage.trim()) {
            sendMessage({
                type: 'chat',
                user: curUser,
                content: chatMessage.trim(),
            });
            setChatMessage('');
            setLobbyChats(prev => [
                ...prev,
                {
                    user: curUser.username,
                    content: chatMessage.trim(),
                    timeStamp: new Date().toISOString(),
                },
            ]);
        }
    };

    return (
        <div className={`lobby-container ${isDarkMode ? 'dark-mode' : ''}`}>
            <div className="lobby-content">
                <div className="users-list">
                    <ul>
                        {usersInLobby.map((user) => (
                            <li key={user.userId}>
                                <span>{user.username}</span>
                                {user.userId !== curUser.userId && (
                                    <button
                                        onClick={() => callUser(user.userId)}
                                        disabled={
                                            !connected ||
                                            connectedUsers.includes(user.userId) ||
                                            isCalling
                                        }
                                        className={`call-button ${connectedUsers.includes(user.userId) ? 'in-call' : ''
                                            }`}
                                    >
                                        {connectedUsers.includes(user.userId)
                                            ? 'In Call'
                                            : isCalling
                                                ? 'Calling...'
                                                : 'Call'}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="video-section">
                    <div className="videos-grid">
                        {localStreamRef.current && (
                            <div className="video-container">
                                <h4>You</h4>
                                <Video stream={localStreamRef} muted={true} />
                            </div>
                        )}
                        {Object.entries(remoteStreams).map(([userId, stream]) => (
                            <div key={userId} className="video-container">
                                <h4>
                                    {usersInLobby.find((u) => u.userId === userId)?.username ||
                                        'User'}
                                </h4>
                                <Video stream={stream} muted={false} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="chat-section">
                <div className="chat-messages">
                    {lobbyChats.map((chat, index) => (
                        <div
                            key={index}
                            className={`chat-message ${chat.user === curUser.username ? 'my-message' : ''
                                } ${chat.system ? 'system-message' : ''}`}
                        >
                            <strong>{chat.system ? 'System' : chat.user}</strong>: {chat.content}
                            <span className="chat-timestamp">
                                {new Date(chat.timeStamp).toLocaleTimeString()}
                            </span>
                        </div>
                    ))}
                </div>
                <form onSubmit={sendChatMessage} className="chat-form">
                    <input
                        type="text"
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        placeholder="Type a message..."
                    />
                    <button type="submit" disabled={!chatMessage.trim()}>
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
}