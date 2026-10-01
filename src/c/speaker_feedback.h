#ifndef SPEAKER_FEEDBACK_H
#define SPEAKER_FEEDBACK_H

#include <stdbool.h>

void speaker_feedback_set_enabled(bool enabled);
void speaker_feedback_play_response_done(void);
void speaker_feedback_stop(void);

#endif
