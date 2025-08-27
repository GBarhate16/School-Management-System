import express from "express";
import cors from "cors";

import usersRoute from "./routes/usersRoute";
import schoolsRoute from "./routes/schoolsRoute";
import devicesRoute from "./routes/devicesRoute";

const port = process.env.PORT || 5555;

const app = express();

app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({ extended: false }));

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Authorization"],
  })
);

app.get("/", (req, res) => {
  return res.send("LearnSync!");
});

app.listen(port, () => {
  console.log(`App is listening to port: ${port}`);
});

app.use("/api", usersRoute);
app.use("/api", schoolsRoute);
app.use("/api", devicesRoute);


// import express from "express";
// import http from "http";
// import cors from "cors";
// import { Server as SocketIOServer } from "socket.io";

// import usersRoute from "./routes/usersRoute";
// import schoolsRoute from "./routes/schoolsRoute";
// import devicesRoute from "./routes/devicesRoute";

// const port = process.env.PORT || 5555;

// const app = express();

// const server = http.createServer(app); // 👈 important
// const io = new SocketIOServer(server, {
//   cors: {
//     origin: "*",
//   },
// });

// // 👇 Make io globally accessible via app.set
// app.set("io", io);

// app.use(express.json());
// app.use(express.urlencoded({ extended: false }));

// app.use(
//   cors({
//     origin: "*",
//     exposedHeaders: ["Authorization"],
//   })
// );

// app.get("/", (req, res) => {
//   return res.send("LearnSync!");
// });

// // WebSocket connection
// io.on("connection", (socket) => {
//   console.log("New client connected");

//   socket.on("disconnect", () => {
//     console.log("Client disconnected");
//   });
// });

// server.listen(port, () => {
//   console.log(`App is listening on port: ${port}`);
// });

// app.use("/api", usersRoute);
// app.use("/api", schoolsRoute);
// app.use("/api", devicesRoute);
