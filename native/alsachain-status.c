#include <alsa/pcm_external.h>
#include <alloca.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/types.h>
#include <unistd.h>

struct alsachain_status {
  snd_pcm_ioplug_t io;
  snd_pcm_t *slave;
  char *path;
  snd_pcm_uframes_t written;
};

static void write_state(struct alsachain_status *status, const char *state) {
  int fd = open(status->path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC | O_NOFOLLOW, 0600);
  if (fd < 0) {
    SNDERR("Cannot write status %s: %s", status->path, strerror(errno));
    return;
  }
  dprintf(fd, "pid: %ld\nstate: %s\nrate: %u\nformat: %s\nchannels: %u\n",
          (long)getpid(), state, status->io.rate,
          snd_pcm_format_name(status->io.format), status->io.channels);
  close(fd);
}

static int start(snd_pcm_ioplug_t *io) {
  struct alsachain_status *status = io->private_data;
  int err = snd_pcm_start(status->slave);
  if (err >= 0) write_state(status, "Playing");
  return err;
}

static int stop(snd_pcm_ioplug_t *io) {
  struct alsachain_status *status = io->private_data;
  int err = snd_pcm_drop(status->slave);
  if (err >= 0) write_state(status, "Prepared");
  return err;
}

static snd_pcm_sframes_t pointer(snd_pcm_ioplug_t *io) {
  struct alsachain_status *status = io->private_data;
  snd_pcm_sframes_t delay = 0;
  if (snd_pcm_delay(status->slave, &delay) < 0 || io->buffer_size == 0) return 0;
  return (io->appl_ptr - (delay > 0 ? (snd_pcm_uframes_t)delay : 0)) % io->buffer_size;
}

static snd_pcm_sframes_t transfer(
    snd_pcm_ioplug_t *io,
    const snd_pcm_channel_area_t *areas,
    snd_pcm_uframes_t offset,
    snd_pcm_uframes_t size) {
  struct alsachain_status *status = io->private_data;
  const snd_pcm_channel_area_t *area = &areas[0];
  unsigned int frame_bits = snd_pcm_format_physical_width(io->format) * io->channels;
  if (frame_bits == 0 || area->step != frame_bits || area->first % 8 != 0) return -EINVAL;
  unsigned char *data = area->addr + area->first / 8 + offset * area->step / 8;
  snd_pcm_sframes_t frames = snd_pcm_writei(status->slave, data, size);
  if (frames > 0) status->written += (snd_pcm_uframes_t)frames;
  return frames;
}

static int hw_params(snd_pcm_ioplug_t *io, snd_pcm_hw_params_t *params) {
  struct alsachain_status *status = io->private_data;
  snd_pcm_hw_params_t *slave_params;
  snd_pcm_sw_params_t *slave_sw_params;
  snd_pcm_format_t format;
  unsigned int channels;
  unsigned int rate;
  int dir = 0;
  int err = 0;

  if ((err = snd_pcm_hw_params_get_format(params, &format)) < 0 ||
      (err = snd_pcm_hw_params_get_channels(params, &channels)) < 0 ||
      (err = snd_pcm_hw_params_get_rate(params, &rate, &dir)) < 0)
    return err;
  snd_pcm_hw_params_alloca(&slave_params);
  if ((err = snd_pcm_hw_params_any(status->slave, slave_params)) < 0 ||
      (err = snd_pcm_hw_params_set_access(status->slave, slave_params, SND_PCM_ACCESS_RW_INTERLEAVED)) < 0 ||
      (err = snd_pcm_hw_params_set_format(status->slave, slave_params, format)) < 0 ||
      (err = snd_pcm_hw_params_set_channels(status->slave, slave_params, channels)) < 0 ||
      (err = snd_pcm_hw_params_set_rate(status->slave, slave_params, rate, 0)) < 0)
    return err;
  if ((err = snd_pcm_hw_params(status->slave, slave_params)) < 0) return err;
  snd_pcm_sw_params_alloca(&slave_sw_params);
  if ((err = snd_pcm_sw_params_current(status->slave, slave_sw_params)) < 0) return err;
  snd_pcm_uframes_t boundary;
  if ((err = snd_pcm_sw_params_get_boundary(slave_sw_params, &boundary)) < 0 ||
      (err = snd_pcm_sw_params_set_start_threshold(status->slave, slave_sw_params, boundary)) < 0)
    return err;
  return snd_pcm_sw_params(status->slave, slave_sw_params);
}

static int prepare(snd_pcm_ioplug_t *io) {
  struct alsachain_status *status = io->private_data;
  int err = snd_pcm_prepare(status->slave);
  if (err >= 0) {
    status->written = 0;
    write_state(status, "Prepared");
  }
  return err;
}

static int pause_pcm(snd_pcm_ioplug_t *io, int enable) {
  struct alsachain_status *status = io->private_data;
  int err = snd_pcm_pause(status->slave, enable);
  if (err >= 0) write_state(status, enable ? "Paused" : "Playing");
  return err;
}

static int drain(snd_pcm_ioplug_t *io) {
  struct alsachain_status *status = io->private_data;
  int err = snd_pcm_drain(status->slave);
  if (err >= 0) write_state(status, "Prepared");
  return err;
}

static int close_pcm(snd_pcm_ioplug_t *io) {
  struct alsachain_status *status = io->private_data;
  snd_pcm_close(status->slave);
  free(status->path);
  free(status);
  return 0;
}

static int poll_descriptors_count(snd_pcm_ioplug_t *io) {
  return snd_pcm_poll_descriptors_count(((struct alsachain_status *)io->private_data)->slave);
}

static int poll_descriptors(snd_pcm_ioplug_t *io, struct pollfd *pfds, unsigned int space) {
  return snd_pcm_poll_descriptors(((struct alsachain_status *)io->private_data)->slave, pfds, space);
}

static int poll_revents(snd_pcm_ioplug_t *io, struct pollfd *pfds, unsigned int nfds, unsigned short *revents) {
  return snd_pcm_poll_descriptors_revents(((struct alsachain_status *)io->private_data)->slave, pfds, nfds, revents);
}

static const snd_pcm_ioplug_callback_t callbacks = {
  .start = start,
  .stop = stop,
  .pointer = pointer,
  .transfer = transfer,
  .close = close_pcm,
  .hw_params = hw_params,
  .prepare = prepare,
  .drain = drain,
  .pause = pause_pcm,
  .poll_descriptors_count = poll_descriptors_count,
  .poll_descriptors = poll_descriptors,
  .poll_revents = poll_revents,
};

SND_PCM_PLUGIN_DEFINE_FUNC(alsachain_status) {
  snd_config_iterator_t i, next;
  const char *status_path = NULL;
  const char *slave_name = NULL;
  struct alsachain_status *status;
  unsigned int access = SND_PCM_ACCESS_RW_INTERLEAVED;
  unsigned int formats[] = { SND_PCM_FORMAT_S16_LE, SND_PCM_FORMAT_S24_3LE, SND_PCM_FORMAT_S24_LE, SND_PCM_FORMAT_S32_LE, SND_PCM_FORMAT_FLOAT_LE };
  int err = 0;

  if (stream != SND_PCM_STREAM_PLAYBACK) return -EINVAL;
  snd_config_for_each(i, next, conf) {
    snd_config_t *node = snd_config_iterator_entry(i);
    const char *id;
    if (snd_config_get_id(node, &id) < 0) continue;
    if (strcmp(id, "status_path") == 0) err = snd_config_get_string(node, &status_path);
    else if (strcmp(id, "slave_name") == 0) err = snd_config_get_string(node, &slave_name);
    else if (strcmp(id, "comment") == 0 || strcmp(id, "type") == 0) continue;
    else { SNDERR("Unknown field %s", id); return -EINVAL; }
    if (err < 0) return err;
  }
  if (!status_path || status_path[0] != '/' || !slave_name) return -EINVAL;
  status = calloc(1, sizeof(*status));
  if (!status) return -ENOMEM;
  status->path = strdup(status_path);
  if (!status->path || (err = snd_pcm_open_lconf(&status->slave, slave_name, stream, mode, root)) < 0) {
    free(status->path);
    free(status);
    return err < 0 ? err : -ENOMEM;
  }
  status->io.version = SND_PCM_IOPLUG_VERSION;
  status->io.name = "ALSAChain playback status";
  status->io.callback = &callbacks;
  status->io.private_data = status;
  if ((err = snd_pcm_ioplug_create(&status->io, name, stream, mode)) < 0) goto error;
  if ((err = snd_pcm_ioplug_set_param_list(&status->io, SND_PCM_IOPLUG_HW_ACCESS, 1, &access)) < 0 ||
      (err = snd_pcm_ioplug_set_param_list(&status->io, SND_PCM_IOPLUG_HW_FORMAT, sizeof(formats) / sizeof(formats[0]), formats)) < 0 ||
      (err = snd_pcm_ioplug_set_param_minmax(&status->io, SND_PCM_IOPLUG_HW_CHANNELS, 1, 32)) < 0 ||
      (err = snd_pcm_ioplug_set_param_minmax(&status->io, SND_PCM_IOPLUG_HW_RATE, 4000, 768000)) < 0) goto error_delete;
  *pcmp = status->io.pcm;
  return 0;
error_delete:
  snd_pcm_ioplug_delete(&status->io);
  return err;
error:
  snd_pcm_close(status->slave);
  free(status->path);
  free(status);
  return err;
}

SND_PCM_PLUGIN_SYMBOL(alsachain_status);
