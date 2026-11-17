import {edge} from "./edge";
import {ai33} from "./ai33";
import {elevenlabs} from "./elevenlabs";
import {say} from "./say";
import type {Engine} from "./types";
import {vieneu} from "./vieneu";

export const ENGINES: Record<string, Engine> = {say, edge, elevenlabs, vieneu, ai33};
