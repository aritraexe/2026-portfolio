require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.static(path.join(__dirname, '../')));

async function getAccessToken() {

  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.REFRESH_TOKEN
    }),
    {
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
          ).toString('base64'),
        'Content-Type':
          'application/x-www-form-urlencoded'
      }
    }
  );

  return response.data.access_token;
}

app.get('/spotify', async (req, res) => {

  try {

    const token = await getAccessToken();

    const spotify = await axios.get(
      'https://api.spotify.com/v1/me/player/currently-playing',
      {
        headers:{
          Authorization:`Bearer ${token}`
        }
      }
    );

    if(!spotify.data || !spotify.data.item){

      return res.json({
        playing:false
      });

    }

    const song = spotify.data.item;

    res.json({
      playing:true,
      title:song.name,
      artist:song.artists.map(a=>a.name).join(', '),
      cover:song.album.images[0].url
    });

  } catch {

    res.json({
      playing:false
    });

  }

});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});