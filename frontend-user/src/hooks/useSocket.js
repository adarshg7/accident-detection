import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const useSocket = () => {
  const ref   = useRef(null);
  const [connected,   setConnected]   = useState(false);
  const [newAccident, setNewAccident] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('user_token');
    if (!token) return;

    ref.current = io(
      process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000',
      { auth: { token }, reconnection: true, reconnectionAttempts: 5 }
    );

    ref.current.on('connect',    () => setConnected(true));
    ref.current.on('disconnect', () => setConnected(false));
    ref.current.on('new_accident', setNewAccident);

    return () => ref.current?.disconnect();
  }, []);

  const sendLocation = (lat, lon) => {
    ref.current?.emit('user_location', { lat, lon });
  };

  return { connected, newAccident, sendLocation };
};

export default useSocket;