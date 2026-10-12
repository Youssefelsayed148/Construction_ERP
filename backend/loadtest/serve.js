// Starts the real app WITHOUT the background schedulers (so the measured process only does request work).
'use strict';
const { app } = require('../server');

const port = Number(process.env.PORT || 5055);
app.listen(port, () => console.log(`loadtest server on ${port}`));
