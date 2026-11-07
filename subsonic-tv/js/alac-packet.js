/* SPDX-License-Identifier: LGPL-2.1-or-later
   Mono/stereo ES5 adaptation of FFmpeg n7.1 libavcodec/alac.c.
   Original decoder copyright (c) 2005 David Hammerton.
   See js/vendor/NOTICES.md and COPYING-LGPL-2.1.txt. */
var ALACPacket = (function () {
  'use strict';
  function requireValue(condition) {
    if (!condition) { throw new Error('Unsupported or damaged Apple Lossless packet'); }
  }
  function Bits(data) { this.data = data; this.position = 0; }
  Bits.prototype.read = function (count) {
    var result = 0, position = this.position, available, take;
    requireValue(position + count <= this.data.length * 8);
    while (count) {
      available = 8 - (position & 7); take = Math.min(count,available);
      result = result * (1 << take) + ((this.data[position >>> 3] >>> (available - take)) & ((1 << take) - 1));
      position += take; count -= take;
    }
    this.position = position;
    return result;
  };
  function signed(value, width) { return (value << (32 - width)) >> (32 - width); }
  function log2(n) {
    var value = 0;
    while (n >= 2) { n >>>= 1; value++; }
    return value;
  }
  function scalar(bits, k, width) {
    var prefix = 0, suffix;
    while (prefix < 9 && bits.read(1)) { prefix++; }
    if (prefix === 9) { return bits.read(width); }
    if (k === 1) { return prefix; }
    suffix = bits.read(k);
    if (suffix < 2) { bits.position--; }
    return prefix * ((1 << k) - 1) + Math.max(0,suffix - 1);
  }
  function residuals(bits, samples, width, config, multiplier) {
    var history = config[11], limit = config[12], modifier = 0, i, value, run;
    for (i = 0; i < samples.length; i++) {
      value = scalar(bits,Math.min(limit,log2((history >>> 9) + 3)),width) + modifier;
      modifier = 0;
      samples[i] = (value >>> 1) ^ -(value & 1);
      history = value > 65535 ? 65535 : history + value * multiplier - ((history * multiplier) >>> 9);
      if (history < 128 && i + 1 < samples.length) {
        run = scalar(bits,Math.min(limit,7 - log2(history) + ((history + 16) >>> 6)),16);
        requireValue(run < samples.length - i);
        i += run; history = 0; modifier = 1;
      }
    }
  }
  function predict(samples, width, coefficients, quant) {
    var order = coefficients.length, i, j, base, sum, error, direction, delta, sign;
    if (!order) { return; }
    for (i = 1; i < samples.length && (order === 31 || i <= order); i++) {
      samples[i] = signed(samples[i] + samples[i - 1],width);
    }
    for (; i < samples.length; i++) {
      base = i - order - 1; sum = 0; error = samples[i];
      for (j = 0; j < order; j++) { sum += (samples[base + 1 + j] - samples[base]) * coefficients[j]; }
      samples[i] = signed(samples[base] + error + Math.floor(((sum | 0) + (1 << (quant - 1))) / (1 << quant)),width);
      direction = error < 0 ? -1 : 1;
      for (j = 0; j < order && error * direction > 0; j++) {
        delta = samples[base] - samples[base + 1 + j];
        sign = delta === 0 ? 0 : delta < 0 ? -direction : direction;
        coefficients[j] -= sign;
        error -= ((delta * sign) >> quant) * (j + 1);
      }
    }
  }
  function decode(payload, config, context) {
    var bits = new Bits(payload), channels = bits.read(3) + 1, depth = config[9];
    var view = new DataView(config.buffer,config.byteOffset,config.byteLength);
    var capacity = view.getUint32(4), rate = view.getUint32(24);
    requireValue(config[8] === 0 && channels === config[13] && (channels === 1 || channels === 2));
    requireValue([16,20,24,32].indexOf(depth) >= 0 && rate >= 8000 && rate <= 96000 && capacity <= 16384);
    bits.read(16);
    var shortFrame = bits.read(1), extra = bits.read(2) * 8, raw = bits.read(1);
    var frames = shortFrame ? bits.read(32) : capacity, width = depth - extra + channels - 1;
    requireValue(frames > 0 && frames <= capacity);
    var samples = [], low = [], predictors = [], ch, i, j, weight = 0, shift = 0;
    for (ch = 0; ch < channels; ch++) { samples.push(new Int32Array(frames)); }
    if (raw) {
      extra = 0;
      for (i = 0; i < frames; i++) {
        for (ch = 0; ch < channels; ch++) { samples[ch][i] = signed(bits.read(depth),depth); }
      }
    } else {
      requireValue(width > 0 && width <= 32 && config[12] > 0 && config[12] <= 16);
      shift = bits.read(8); weight = bits.read(8);
      requireValue(!weight || shift < 32);
      for (ch = 0; ch < channels; ch++) {
        var type = bits.read(4), quant = bits.read(4), multiplier = (bits.read(3) * config[10]) >>> 2;
        var coefficients = new Int16Array(bits.read(5));
        requireValue(quant && (type === 0 || type === 15));
        for (j = coefficients.length - 1; j >= 0; j--) { coefficients[j] = signed(bits.read(16),16); }
        predictors.push({type:type,quant:quant,multiplier:multiplier,coefficients:coefficients});
      }
      if (extra) {
        for (ch = 0; ch < channels; ch++) { low.push(new Uint32Array(frames)); }
        for (i = 0; i < frames; i++) {
          for (ch = 0; ch < channels; ch++) { low[ch][i] = bits.read(extra); }
        }
      }
      for (ch = 0; ch < channels; ch++) {
        var predictor = predictors[ch];
        residuals(bits,samples[ch],width,config,predictor.multiplier);
        if (predictor.type === 15) { predict(samples[ch],width,{length:31},0); }
        predict(samples[ch],width,predictor.coefficients,predictor.quant);
      }
      if (channels === 2 && weight) {
        for (i = 0; i < frames; i++) {
          var difference = samples[1][i], right = samples[0][i] - ((difference * weight) >> shift);
          samples[0][i] = right + difference; samples[1][i] = right;
        }
      }
    }
    requireValue(bits.read(3) === 7);
    var buffer = context.createBuffer(channels,frames,rate), divisor = Math.pow(2,depth - 1);
    for (ch = 0; ch < channels; ch++) {
      var output = buffer.getChannelData(ch);
      for (i = 0; i < frames; i++) {
        var value = samples[ch][i];
        if (extra) { value = (value << extra) | low[ch][i]; }
        output[i] = signed(value,depth) / divisor;
      }
    }
    return buffer;
  }
  return {decode:decode};
}());
