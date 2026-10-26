# Bluff Mates

A real-time trivia bluff game for 2–8 players. Each round, players invent a fake answer to a curious question, then vote for the real answer. Find the truth for 100 points; earn 50 points for every player your bluff fools. The host chooses 3, 5, or 7 rounds, and the highest score wins.

## Play locally

Requires Node.js 20 or newer. No package installation is needed.

1. Open a terminal in this folder.
2. Run npm start.
3. Open http://localhost:3000.
4. Open the same address in another browser or on another device on your Wi-Fi. Share the room code. For another device on the same Wi-Fi, use this computer's local network address instead of localhost.

The server listens on all network interfaces, so local network devices can reach it if the computer and network firewall allow it.

## Publish a public version

This project includes a Render Blueprint in render.yaml and uses one Node web service for both the site and WebSocket game server.

1. Put this folder in a GitHub repository.
2. In Render, create a new Blueprint and connect that repository.
3. Deploy the bluff-mates web service. Render will provide an onrender.com URL.
4. Open that URL on two separate devices and test a full game before sharing it.

The service uses in-memory rooms. Keep a game on one running service instance; rooms reset if the service restarts or redeploys. Render's free service can sleep when idle, so the first visit may take a little longer to wake. Active WebSocket rooms work across the public internet.

## Game rules

- 2–8 players join with a five-character room code. The first player is the host.
- The host selects 3, 5, or 7 rounds and starts the game.
- Every connected player submits one short fake answer to the question.
- The real answer and the submitted fakes are shuffled together.
- Players vote once for the real answer. A player cannot vote for their own bluff.
- Correct votes earn 100 points. Every vote for a player's fake answer earns that player 50 points.
- The final scoreboard ranks players by total points. A tie shares the win.

The interface includes these rules at the help button, a ready check, room-code copying, round progress, feedback after each phase, live scoreboards, host handoff if the host disconnects, and a rematch option.
