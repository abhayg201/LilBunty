import { mount } from "svelte";
import Options from "../components/Options.svelte";
import "../app.css"

// Options
// https://developer.chrome.com/docs/extensions/mv3/options/

function render() {
    const target = document.getElementById("app");

    if (target) {
        mount(Options, { target });
    }
}

document.addEventListener("DOMContentLoaded", render);
