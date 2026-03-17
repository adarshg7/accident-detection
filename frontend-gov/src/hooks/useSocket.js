import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const useSocket = () => {
  const socketRef  = useRef(null);
  // useRef = persists across renders without causing re-renders
  // Perfect for storing the socket connection

  const [connected,       setConnected]       = useState(false);
  const [newAccident,     setNewAccident]      = useState(null);
  const [statusUpdate,    setStatusUpdate]     = useState(null);
  const [liveStats,       setLiveStats]        = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('gov_token');
    if (!token) return;

    socketRef.current = io(
      process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000',
      {
        auth: { token },
        // Send JWT token with socket connection
        // Server validates it in socketHandler.js

        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        // Auto-reconnect if connection drops
      }
    );

    const socket = socketRef.current;

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('new_accident', (data) => {
      setNewAccident(data);
      // When new accident detected → update state
      // Dashboard listens to newAccident and shows alert
    });

    socket.on('accident_status_update', (data) => {
      setStatusUpdate(data);
    });

    socket.on('live_stats', (data) => {
      setLiveStats(data);
    });

    // Join gov room for official-only events
    socket.emit('join_gov');

    return () => {
      socket.disconnect();
      // Cleanup: disconnect when component unmounts
    };
  }, []);

  return {
    socket: socketRef.current,
    connected,
    newAccident,
    statusUpdate,
    liveStats,
  };
};

export default useSocket;