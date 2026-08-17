import './styles/main.css';
import './styles/props.css';
import './styles/editor.css';
import { App } from './ui/app';

const app = new App(document.getElementById('app') as HTMLElement);
(window as any).app = app;
console.log('TerrainForge ready');
