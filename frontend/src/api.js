import axios from 'axios';
import API from '../api';

// .env එකෙන් API Base URL එක ගනී.
// Developement හිදී Proxy භාවිත කරන්නේ නම් empty string ('') ලෙස ක්‍රියා කරයි.
const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
});

export default API;