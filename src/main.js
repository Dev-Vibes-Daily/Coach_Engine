// src/main.js — entry point.
// Swap the import below to change which coach boots. That is the ONLY
// line that ties this app to a specific coach.

import './styles/base.css'
import config from './config/example.coach.js'
import { boot } from './core/ui.js'

boot(config)
