package main

import "fmt"

type ScoreJob struct {
	UserID string
	Score  int
	Band   string
}

func process(job ScoreJob) string {
	return fmt.Sprintf("%s:%s:%d", job.UserID, job.Band, job.Score)
}

func shouldNotify(job ScoreJob) bool {
	return job.Band == "high" || job.Score >= 90
}
