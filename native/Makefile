CC ?= cc
CFLAGS := -O2 -fPIC -DPIC -std=c11 -D_POSIX_C_SOURCE=200809L -Wall -Wextra -Werror $(shell pkg-config --cflags alsa)
LDFLAGS := -shared $(shell pkg-config --libs alsa)
OUT := ../build/libasound_module_pcm_alsachain_status.so

.PHONY: all clean

all: $(OUT)

$(OUT): alsachain-status.c | ../build

	$(CC) $(CFLAGS) $< -o $@ $(LDFLAGS)

../build:
	mkdir -p $@

clean:
	rm -f $(OUT)
